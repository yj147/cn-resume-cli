import fs from "node:fs";
import path from "node:path";
import { TEMPLATE_ALIASES, TEMPLATE_LIST } from "./constants.js";
import { ensureDir, readJson, readText, writeJson } from "./core/io.js";
import { createEmptyParseEvidence, normalizeReactiveJson, nowIso, sha256Text } from "./core/model.js";
import { normalizeFlowEngine, resolveAiRuntimeOptions, resolveEvalOptions } from "./eval/evaluation.js";
import { REVIEW_TASKS, runReviewService } from "./eval/review-service.js";
import {
  attachParseDiagnostics,
  assertPhaseBConfirmedOrThrow,
  assertRequiredContactOrThrow,
  buildPhaseBDiffSnapshot,
  buildSectionFirstParseEvidence,
  optimizeModel,
  optimizeModelByAI,
  parseInput,
  parseInputByAI,
  parseTextToModel,
  PHASE_B_PROMPT
} from "./flows/parse-optimize.js";
import { assertLayoutExportReady, generateDocx, modelToPlainText } from "./flows/render.js";
import { parsePdfToText } from "./pdf.js";
import { generatePdf as renderPdfBuffer } from "./jadeai/generate-pdf.js";
import {
  createTemplatePreviewSample,
  loadCustomTemplateConfig,
  renderTemplate,
  resolveTemplate,
  saveCustomTemplateConfig,
  templateListPayload,
  validateImportedTemplateSource
} from "./template/custom-template.js";
import { inferFormat, parseFlags } from "./cli/args.js";

function normalizeTemplateKey(inputName) {
  return String(inputName || "").trim().toLowerCase();
}

function writeOutputMaybe(outputPath, payload, asJson = true) {
  if (!outputPath) {
    process.stdout.write(`${asJson ? JSON.stringify(payload, null, 2) : payload}\n`);
    return;
  }
  ensureDir(path.dirname(outputPath));
  if (asJson) {
    writeJson(outputPath, payload);
  } else {
    fs.writeFileSync(outputPath, payload, "utf8");
  }
}

export async function runParse(flags) {
  const inputPath = flags.input;
  if (!inputPath) {
    throw new Error("parse requires --input");
  }
  try {
    const parseEngine = normalizeFlowEngine(flags.engine || process.env.CN_RESUME_PARSE_ENGINE, "rule", "parse");
    const model = parseEngine === "ai" ? await parseInputByAI(inputPath, resolveAiRuntimeOptions(flags)) : await parseInput(inputPath);
    assertRequiredContactOrThrow(model);
    const parseWarnings = attachParseDiagnostics(model);
    model.meta = {
      ...(model.meta || {}),
      created_at: model.meta?.created_at || nowIso(),
      source: model.meta?.source || "cn-resume-cli",
      template: model.meta?.template || "",
      parse_evidence: buildSectionFirstParseEvidence(model)
    };
    if (parseWarnings.length) {
      for (const warning of parseWarnings) {
        console.error(`[cn-resume] WARN: ${warning}`);
      }
    }

    if (flags.output) {
      writeJson(flags.output, model);
    } else {
      process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);
    }
  } catch (error) {
    const message = String(error?.message || error || "");
    if (message.startsWith("BLOCKED:")) {
      throw error;
    }
    throw new Error(`BLOCKED: parse_failed (${message})`);
  }
}

export async function runOptimize(flags) {
  const inputPath = flags.input;
  const outputPath = flags.output;
  if (!inputPath || !outputPath) {
    throw new Error("optimize requires --input and --output");
  }
  const ext = path.extname(inputPath).toLowerCase();
  const model = ext === ".json" ? normalizeReactiveJson(readJson(inputPath)) : parseTextToModel(readText(inputPath));
  const jdText = flags.jd ? readText(flags.jd) : "";
  const feedbackText = String(flags.feedback || "").trim();
  const confirmed = Boolean(flags.confirm);
  const optimizeEngine = normalizeFlowEngine(flags.engine || process.env.CN_RESUME_OPTIMIZE_ENGINE, "rule", "optimize");
  const optimized =
    optimizeEngine === "ai"
      ? await optimizeModelByAI(model, jdText, feedbackText, resolveAiRuntimeOptions(flags))
      : optimizeModel(model, jdText, feedbackText);
  const phaseBDiff = buildPhaseBDiffSnapshot(model, optimized);
  const runId = String(flags["run-id"] || nowIso()).trim();
  optimized.meta = {
    ...(optimized.meta || {}),
    phase_b: {
      run_id: runId,
      status: confirmed ? "confirmed" : "awaiting_feedback",
      asked_question: PHASE_B_PROMPT,
      requires_confirmation: !confirmed,
      confirmed,
      confirmation_text: confirmed ? feedbackText || "确认" : "",
      last_feedback: feedbackText || "",
      updated_at: nowIso(),
      diff_hash: sha256Text(JSON.stringify(phaseBDiff)),
      diff: phaseBDiff
    }
  };
  if (!confirmed) {
    console.error(
      `[cn-resume] INFO: Phase B awaiting confirmation. ${PHASE_B_PROMPT} Re-run optimize with --feedback "..." --confirm before review/export commands.`
    );
  }
  writeJson(outputPath, optimized);
}

export async function runGenerate(flags) {
  const inputPath = flags.input;
  const outputPath = flags.output;
  if (!inputPath || !outputPath) {
    throw new Error("generate requires --input and --output");
  }
  const model = normalizeReactiveJson(readJson(inputPath));
  assertPhaseBConfirmedOrThrow(model, "generate");
  const layoutGateSource =
    (model as any)?.meta?.layoutResult ||
    (model as any)?.meta?.layout_result ||
    (model as any)?.render_config?.layoutResult;
  assertLayoutExportReady(layoutGateSource, "generate");
  const templateInput = flags.template || model?.render_config?.template || model?.meta?.template || "elegant";
  const resolvedTemplate = resolveTemplate(templateInput);
  const template = resolvedTemplate.resolved;
  const format = inferFormat(outputPath, flags.format);
  model.meta = {
    ...(model.meta || {}),
    created_at: model.meta?.created_at || nowIso(),
    source: model.meta?.source || "cn-resume-cli",
    template,
    parse_evidence: model.meta?.parse_evidence || createEmptyParseEvidence()
  };
  model.render_config = {
    template,
    pages: Number(model.render_config?.pages || 1),
    modules: Array.isArray(model.render_config?.modules) ? model.render_config.modules : [],
    module_order: Array.isArray(model.render_config?.module_order) ? model.render_config.module_order : [],
    theme_color: model.render_config?.theme_color || "",
    font_size: model.render_config?.font_size || "",
    output_formats: Array.isArray(model.render_config?.output_formats) ? model.render_config.output_formats : [],
    provenance: model.render_config?.provenance
  };

  if (format === "json") {
    writeJson(outputPath, model);
    return;
  }
  if (format === "txt") {
    fs.writeFileSync(outputPath, modelToPlainText(model), "utf8");
    return;
  }

  const rendered = await renderTemplate(model, templateInput, format === "pdf");
  if (format === "html") {
    fs.writeFileSync(outputPath, rendered.html, "utf8");
    return;
  }
  if (format === "docx") {
    await generateDocx(model, outputPath);
    return;
  }
  if (format === "pdf") {
    const pdfBuffer = await renderPdfBuffer(rendered.html, {
      fitOnePage: Boolean(flags["fit-one-page"] || flags.fitOnePage)
    });
    fs.writeFileSync(outputPath, pdfBuffer);
    return;
  }

  throw new Error(`Unsupported format '${format}'.`);
}

export async function runValidate(flags) {
  const inputPath = flags.input;
  if (!inputPath) {
    throw new Error("validate requires --input");
  }
  const evalOptions = resolveEvalOptions(flags);
  let model;
  if (path.extname(inputPath).toLowerCase() === ".pdf") {
    const text = await parsePdfToText(inputPath);
    model = parseTextToModel(text);
  } else {
    model = normalizeReactiveJson(readJson(inputPath));
    assertPhaseBConfirmedOrThrow(model, "validate");
  }
  const jdText = flags.jd ? readText(flags.jd) : "";
  const templateInput = flags.template || model?.render_config?.template || model?.meta?.template || "elegant";
  const template = resolveTemplate(templateInput).resolved;
  const report = (await runReviewService({
    model,
    jdText,
    template,
    options: evalOptions,
    checks: [REVIEW_TASKS.VALIDATE]
  })).reports[REVIEW_TASKS.VALIDATE];
  writeOutputMaybe(flags.output, report, true);
}

export async function runAnalyzeJd(flags) {
  if (!flags.input) {
    throw new Error("analyze-jd requires --input");
  }
  if (!flags.jd) {
    throw new Error("analyze-jd requires --jd");
  }
  const evalOptions = resolveEvalOptions(flags);
  const model = normalizeReactiveJson(readJson(flags.input));
  assertPhaseBConfirmedOrThrow(model, "analyze-jd");
  const jd = readText(flags.jd);
  const report = (await runReviewService({
    model,
    jdText: jd,
    options: evalOptions,
    checks: [REVIEW_TASKS.ANALYZE_JD]
  })).reports[REVIEW_TASKS.ANALYZE_JD];
  writeOutputMaybe(flags.output, report, true);
}

export async function runGrammarCheck(flags) {
  if (!flags.input) {
    throw new Error("grammar-check requires --input");
  }
  const evalOptions = resolveEvalOptions(flags);
  const model = normalizeReactiveJson(readJson(flags.input));
  assertPhaseBConfirmedOrThrow(model, "grammar-check");
  const report = (await runReviewService({
    model,
    options: evalOptions,
    checks: [REVIEW_TASKS.GRAMMAR_CHECK]
  })).reports[REVIEW_TASKS.GRAMMAR_CHECK];
  writeOutputMaybe(flags.output, report, true);
}

function runTemplateList() {
  process.stdout.write(`${JSON.stringify(templateListPayload(), null, 2)}\n`);
}

export async function runTemplatePreview(flags) {
  const name = flags.name || flags.template || "elegant";
  const previewModel = flags.input
    ? normalizeReactiveJson(readJson(flags.input))
    : createTemplatePreviewSample();
  const rendered = await renderTemplate(previewModel, name, false);
  if (!flags.output) {
    throw new Error("template preview requires --output");
  }
  fs.writeFileSync(flags.output, rendered.html, "utf8");
}

function runTemplateImport(flags) {
  if (!flags.name || !flags.file) {
    throw new Error("template import requires --name and --file");
  }
  const name = normalizeTemplateKey(flags.name);
  const sourcePath = path.resolve(flags.file);
  validateImportedTemplateSource(sourcePath);

  const custom = loadCustomTemplateConfig();
  if (TEMPLATE_LIST.includes(name) || Object.prototype.hasOwnProperty.call(TEMPLATE_ALIASES, name)) {
    throw new Error(`Template name conflict: '${name}' is reserved by builtin/alias.`);
  }
  if (custom.imports[name] || custom.aliases[name]) {
    throw new Error(`Template name conflict: '${name}' already exists in custom config.`);
  }
  custom.imports = custom.imports || {};
  custom.imports[name] = sourcePath;
  saveCustomTemplateConfig(custom);
  process.stdout.write(`[cn-resume] imported template '${name}' from '${sourcePath}'\n`);
}

function runTemplateClone(flags) {
  if (!flags.source || !flags.name) {
    throw new Error("template clone requires --source and --name");
  }
  const targetName = normalizeTemplateKey(flags.name);
  if (TEMPLATE_LIST.includes(targetName) || Object.prototype.hasOwnProperty.call(TEMPLATE_ALIASES, targetName)) {
    throw new Error(`Template name conflict: '${targetName}' is reserved by builtin/alias.`);
  }
  const custom = loadCustomTemplateConfig();
  if (custom.imports[targetName] || custom.aliases[targetName]) {
    throw new Error(`Template name conflict: '${targetName}' already exists in custom config.`);
  }
  const source = resolveTemplate(flags.source, custom);
  custom.aliases = custom.aliases || {};
  custom.aliases[targetName] = source.resolved;
  saveCustomTemplateConfig(custom);
  process.stdout.write(`[cn-resume] cloned template '${source.resolved}' as alias '${targetName}'\n`);
}

export async function runTemplateCommand(args) {
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  if (sub === "list") {
    runTemplateList();
    return;
  }
  if (sub === "preview") {
    await runTemplatePreview(flags);
    return;
  }
  if (sub === "import") {
    runTemplateImport(flags);
    return;
  }
  if (sub === "clone") {
    runTemplateClone(flags);
    return;
  }
  throw new Error("template subcommand must be one of: list, preview, import, clone");
}
