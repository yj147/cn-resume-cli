import { runAiWithSchemaRecovery } from "../ai.js";
import { TEMPLATE_STYLES } from "../constants.js";
import { normalizeBulletList, nowIso } from "../core/model.js";
import { resolveTemplate } from "../template/custom-template.js";

const WEAK_WORDS = ["负责", "参与", "协助", "做了", "一些", "较好", "不错", "很多"];
const ATS_FRIENDLY_TEMPLATES = new Set(["ats", "compact", "classic", "minimal", "elegant"]);
const VALID_EVAL_ENGINES = new Set(["hybrid", "ai", "rule"]);
const VALID_FLOW_ENGINES = new Set(["ai", "rule"]);
const DEFAULT_PROMPT_VERSION = "v1";
const DEFAULT_EVAL_ENGINE = "hybrid";

type EvalEngine = "hybrid" | "ai" | "rule";
export type FlowEngine = "ai" | "rule";

type QualityGates = {
  average_gte_7: boolean;
  min_dimension_gte_5: boolean;
  passed: boolean;
};

type EvalMeta = {
  engine: EvalEngine;
  model: string;
  prompt_version: string;
  generated_at: string;
  confidence: number;
};

const VALIDATE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scores", "average", "verdict", "warnings", "confidence"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["匹配度", "量化程度", "表达力", "结构完整性", "ATS友好度", "版面适配度", "视觉层次感"],
      properties: {
        匹配度: { type: "number", minimum: 0, maximum: 10 },
        量化程度: { type: "number", minimum: 0, maximum: 10 },
        表达力: { type: "number", minimum: 0, maximum: 10 },
        结构完整性: { type: "number", minimum: 0, maximum: 10 },
        ATS友好度: { type: "number", minimum: 0, maximum: 10 },
        版面适配度: { type: "number", minimum: 0, maximum: 10 },
        视觉层次感: { type: "number", minimum: 0, maximum: 10 }
      }
    },
    average: { type: "number", minimum: 0, maximum: 10 },
    verdict: { type: "string", enum: ["PASS", "NEEDS_REVISION"] },
    warnings: { type: "array", items: { type: "string" } },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
};

const ANALYZE_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overallScore", "keywordMatches", "missingKeywords", "suggestions", "atsScore", "summary", "confidence"],
  properties: {
    overallScore: { type: "number", minimum: 0, maximum: 100 },
    keywordMatches: { type: "array", items: { type: "string" } },
    missingKeywords: { type: "array", items: { type: "string" } },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "current", "suggested"],
        properties: {
          section: { type: "string" },
          current: { type: "string" },
          suggested: { type: "string" }
        }
      }
    },
    atsScore: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
};

const GRAMMAR_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues", "summary", "score", "confidence"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sectionId", "sectionTitle", "type", "original", "suggestion", "severity"],
        properties: {
          sectionId: { type: "string" },
          sectionTitle: { type: "string" },
          type: { type: "string" },
          original: { type: "string" },
          suggestion: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] }
        }
      }
    },
    summary: { type: "string" },
    score: { type: "number", minimum: 0, maximum: 100 },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
};

function normalizeEvalEngine(rawEngine): EvalEngine {
  const engine = String(rawEngine || DEFAULT_EVAL_ENGINE).trim().toLowerCase();
  if (!VALID_EVAL_ENGINES.has(engine)) {
    throw new Error(`Unsupported engine '${rawEngine}'. Allowed: hybrid|ai|rule`);
  }
  return engine as EvalEngine;
}

export function normalizeFlowEngine(rawEngine, fallbackEngine, commandName): FlowEngine {
  const engine = String(rawEngine || fallbackEngine).trim().toLowerCase();
  if (!VALID_FLOW_ENGINES.has(engine)) {
    throw new Error(`Unsupported engine '${rawEngine}' for ${commandName}. Allowed: ai|rule`);
  }
  return engine as FlowEngine;
}

function normalizeBaseUrl(rawUrl) {
  const base = String(rawUrl || "").trim() || "https://api.openai.com/v1";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/v1`;
}

export function resolveAiRuntimeOptions(flags) {
  const model =
    String(flags.model || process.env.CN_RESUME_AI_MODEL || process.env.OPENAI_MODEL || "").trim() || "gpt-4o-mini";
  const promptVersion = String(flags["prompt-version"] || process.env.CN_RESUME_PROMPT_VERSION || DEFAULT_PROMPT_VERSION).trim();
  const apiKey = String(process.env.CN_RESUME_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "").trim();
  const baseUrl = normalizeBaseUrl(process.env.CN_RESUME_BASE_URL || process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL);
  return { model, promptVersion, apiKey, baseUrl };
}

export function resolveEvalOptions(flags) {
  const engine = normalizeEvalEngine(flags.engine || process.env.CN_RESUME_EVAL_ENGINE || DEFAULT_EVAL_ENGINE);
  return { engine, ...resolveAiRuntimeOptions(flags) };
}

function normalizeConfidence(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric >= 0 && numeric <= 1) {
    return Number(numeric.toFixed(3));
  }
  if (numeric > 1 && numeric <= 100) {
    return Number((numeric / 100).toFixed(3));
  }
  return fallback;
}

function assertArrayOfStrings(value, fieldName) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`[SCHEMA] Field '${fieldName}' must be string[]`);
  }
}

function assertScoreBounds(value, fieldName, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`[SCHEMA] Field '${fieldName}' must be number in [${min}, ${max}]`);
  }
}

function readJdKeywords(jdText) {
  const candidates = jdText
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_#+.-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const counts = new Map();
  for (const token of candidates) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word]) => word);
}

function collectAllBullets(model) {
  const exp = (model.experience || []).flatMap((x) => normalizeBulletList(x.bullets));
  const proj = (model.projects || []).flatMap((x) => normalizeBulletList(x.bullets));
  return [...exp, ...proj];
}

function safeScore(value) {
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function evaluateScores(model, jdText = "", templateName = "elegant") {
  const bullets = collectAllBullets(model);
  const joined = bullets.join(" ");
  const hasNumbers = bullets.filter((b) => /\d/.test(b)).length;
  const weakCount = bullets.filter((b) => WEAK_WORDS.some((w) => b.includes(w))).length;
  const jdKeywords = jdText ? readJdKeywords(jdText).slice(0, 20) : [];
  const matched = jdKeywords.filter((kw) => JSON.stringify(model).includes(kw)).length;

  const matchScore = jdKeywords.length ? safeScore((matched / jdKeywords.length) * 10) : 7.5;
  const quantifyScore = bullets.length ? safeScore((hasNumbers / bullets.length) * 10 + 4) : 5;
  const expressionScore = bullets.length ? safeScore(10 - weakCount * 0.8) : 5;
  const structureParts = ["experience", "projects", "skills", "education"].filter((key) => (model[key] || []).length).length;
  const structureScore = safeScore(structureParts * 2 + 2);
  const atsScore = ATS_FRIENDLY_TEMPLATES.has(templateName) ? 8.5 : 6.8;
  const contentSize = joined.length + JSON.stringify(model.skills || []).length;
  const layoutFitScore = contentSize < 1800 ? 9 : contentSize < 2600 ? 7.5 : contentSize < 3200 ? 6 : 4.5;
  const style = TEMPLATE_STYLES[templateName] || TEMPLATE_STYLES.elegant;
  const visualHierarchyScore = safeScore(style.layout === "two-column" ? 8.2 : 7.8);

  const scores = {
    匹配度: matchScore,
    量化程度: quantifyScore,
    表达力: expressionScore,
    结构完整性: structureScore,
    ATS友好度: atsScore,
    版面适配度: layoutFitScore,
    视觉层次感: visualHierarchyScore
  };

  const values = Object.values(scores);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const verdict = average >= 7 && values.every((score) => score >= 5) ? "PASS" : "NEEDS_REVISION";

  const warnings = [];
  if (layoutFitScore < 7) {
    warnings.push("简历可能无法完美适配一页。");
  }
  if (visualHierarchyScore < 7) {
    warnings.push("简历视觉层次不够清晰。");
  }
  if (verdict !== "PASS") {
    warnings.push("请先根据评分修订内容，再执行最终导出。");
  }

  return {
    scores,
    average: Number(average.toFixed(2)),
    verdict,
    warnings
  };
}

function analyzeJd(model, jdText) {
  const keywords = readJdKeywords(jdText);
  const payload = JSON.stringify(model);
  const keywordMatches = keywords.filter((kw) => payload.includes(kw)).slice(0, 30);
  const missingKeywords = keywords.filter((kw) => !payload.includes(kw)).slice(0, 30);
  const overallScore = keywords.length ? Math.round((keywordMatches.length / keywords.length) * 100) : 70;
  let normalizedTemplate = "elegant";
  try {
    normalizedTemplate = resolveTemplate(model?.render_config?.template || model?.meta?.template || "elegant").resolved;
  } catch {
    normalizedTemplate = "elegant";
  }
  const atsScore = ATS_FRIENDLY_TEMPLATES.has(normalizedTemplate) ? 85 : 68;
  return {
    overallScore,
    keywordMatches,
    missingKeywords,
    suggestions: missingKeywords.slice(0, 8).map((kw) => ({
      section: "experience/projects",
      current: "关键词覆盖不足",
      suggested: `补充与“${kw}”相关的真实项目成果描述`
    })),
    atsScore,
    summary: overallScore >= 80 ? "匹配度较高，可直接微调后投递。" : "存在明显关键词缺口，建议补齐关键能力描述。"
  };
}

function grammarCheck(model) {
  const issues = [];
  const bullets = collectAllBullets(model);
  bullets.forEach((line, idx) => {
    if (WEAK_WORDS.some((word) => line.includes(word))) {
      issues.push({
        sectionId: `bullet-${idx + 1}`,
        sectionTitle: "工作/项目要点",
        type: "weak_verb",
        original: line,
        suggestion: line.replace(new RegExp(`(${WEAK_WORDS.join("|")})`, "g"), "主导"),
        severity: "medium"
      });
    }
    if (!/\d/.test(line) && /提升|优化|增长|降低/.test(line)) {
      issues.push({
        sectionId: `bullet-${idx + 1}`,
        sectionTitle: "工作/项目要点",
        type: "quantify",
        original: line,
        suggestion: `${line}（补充范围/频次/规模等可验证信息）`,
        severity: "low"
      });
    }
  });
  const score = Math.max(0, 100 - issues.length * 7);
  return {
    issues,
    summary: issues.length ? "存在可优化表达，建议增强动作动词与量化信息。" : "未发现明显写作问题。",
    score
  };
}

function computeQualityGates(scores) {
  const values = Object.values(scores).map((value) => Number(value));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const averageGate = average >= 7;
  const minGate = values.every((value) => value >= 5);
  return {
    average_gte_7: averageGate,
    min_dimension_gte_5: minGate,
    passed: averageGate && minGate
  } satisfies QualityGates;
}

function deriveAverageFromScores(scores) {
  const values = Object.values(scores).map((value) => Number(value));
  if (!values.length) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function deriveVerdictFromQualityGates(gates) {
  return gates.passed ? "PASS" : "NEEDS_REVISION";
}

function validateReportSchemaOrThrow(report, enforceConsistency = true) {
  if (!report || typeof report !== "object") {
    throw new Error("[SCHEMA] validate report must be an object");
  }
  if (!report.scores || typeof report.scores !== "object" || Array.isArray(report.scores)) {
    throw new Error("[SCHEMA] validate.scores must be an object");
  }
  const requiredDimensions = ["匹配度", "量化程度", "表达力", "结构完整性", "ATS友好度", "版面适配度", "视觉层次感"];
  const normalizedScores = {};
  for (const dimension of requiredDimensions) {
    const value = Number(report.scores[dimension]);
    assertScoreBounds(value, `scores.${dimension}`, 0, 10);
    normalizedScores[dimension] = Number(value.toFixed(2));
  }
  if (!["PASS", "NEEDS_REVISION"].includes(String(report.verdict))) {
    throw new Error("[SCHEMA] verdict must be PASS or NEEDS_REVISION");
  }
  assertArrayOfStrings(report.warnings || [], "warnings");

  const gates = computeQualityGates(normalizedScores);
  const verdict = deriveVerdictFromQualityGates(gates);
  return {
    // average is redundant derived data; recompute from validated dimension scores so
    // json_object fallback drift on a single field does not kill the whole review.
    scores: normalizedScores,
    average: deriveAverageFromScores(normalizedScores),
    // verdict follows the same local quality gates for the same reason as average.
    verdict: enforceConsistency ? verdict : String(report.verdict),
    warnings: report.warnings || [],
    quality_gates: gates
  };
}

function analyzeReportSchemaOrThrow(report) {
  if (!report || typeof report !== "object") {
    throw new Error("[SCHEMA] analyze-jd report must be an object");
  }
  assertScoreBounds(Number(report.overallScore), "overallScore", 0, 100);
  assertScoreBounds(Number(report.atsScore), "atsScore", 0, 100);
  assertArrayOfStrings(report.keywordMatches || [], "keywordMatches");
  assertArrayOfStrings(report.missingKeywords || [], "missingKeywords");
  if (!Array.isArray(report.suggestions)) {
    throw new Error("[SCHEMA] suggestions must be array");
  }
  const suggestions = report.suggestions.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new Error(`[SCHEMA] suggestions[${idx}] must be object`);
    }
    if (typeof item.section !== "string" || typeof item.current !== "string" || typeof item.suggested !== "string") {
      throw new Error(`[SCHEMA] suggestions[${idx}] requires section/current/suggested string fields`);
    }
    return {
      section: item.section,
      current: item.current,
      suggested: item.suggested
    };
  });
  if (typeof report.summary !== "string") {
    throw new Error("[SCHEMA] summary must be string");
  }
  return {
    overallScore: Number(Math.round(Number(report.overallScore))),
    keywordMatches: report.keywordMatches || [],
    missingKeywords: report.missingKeywords || [],
    suggestions,
    atsScore: Number(Math.round(Number(report.atsScore))),
    summary: report.summary
  };
}

function grammarReportSchemaOrThrow(report) {
  if (!report || typeof report !== "object") {
    throw new Error("[SCHEMA] grammar-check report must be an object");
  }
  assertScoreBounds(Number(report.score), "score", 0, 100);
  if (!Array.isArray(report.issues)) {
    throw new Error("[SCHEMA] issues must be array");
  }
  const issues = report.issues.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new Error(`[SCHEMA] issues[${idx}] must be object`);
    }
    const severity = String(item.severity || "");
    if (!["low", "medium", "high"].includes(severity)) {
      throw new Error(`[SCHEMA] issues[${idx}].severity must be low|medium|high`);
    }
    const required = ["sectionId", "sectionTitle", "type", "original", "suggestion"];
    for (const field of required) {
      if (typeof item[field] !== "string") {
        throw new Error(`[SCHEMA] issues[${idx}].${field} must be string`);
      }
    }
    return {
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
      type: item.type,
      original: item.original,
      suggestion: item.suggestion,
      severity
    };
  });
  if (typeof report.summary !== "string") {
    throw new Error("[SCHEMA] summary must be string");
  }
  return {
    issues,
    summary: report.summary,
    score: Number(Math.round(Number(report.score)))
  };
}

function buildEvalMeta(options, confidence): EvalMeta {
  return {
    engine: options.engine,
    model: options.model,
    prompt_version: options.promptVersion || DEFAULT_PROMPT_VERSION,
    generated_at: nowIso(),
    confidence: normalizeConfidence(confidence, options.engine === "rule" ? 0.65 : 0.5)
  };
}

async function evaluateValidateByAI(model, jdText, template, options) {
  const prompt = {
    task: "validate",
    prompt_version: options.promptVersion,
    template,
    requirements: {
      dimensions: ["匹配度", "量化程度", "表达力", "结构完整性", "ATS友好度", "版面适配度", "视觉层次感"],
      score_range: "0-10",
      verdict: "PASS|NEEDS_REVISION",
      warnings: "string[]",
      confidence: "0-1"
    },
    jd_text: jdText || "",
    resume: model
  };
  const { normalized, aiReport } = await runAiWithSchemaRecovery(
    "validate",
    options,
    prompt,
    {
      name: "cn_resume_validate_result",
      schema: VALIDATE_OUTPUT_JSON_SCHEMA
    },
    (rawReport) => validateReportSchemaOrThrow(rawReport, options.engine === "hybrid")
  );
  return {
    ...normalized,
    template,
    ...buildEvalMeta(options, aiReport.confidence)
  };
}

export async function analyzeJdByAI(model, jdText, options) {
  const prompt = {
    task: "analyze-jd",
    prompt_version: options.promptVersion,
    requirements: {
      overallScore: "0-100",
      atsScore: "0-100",
      keywordMatches: "string[]",
      missingKeywords: "string[]",
      suggestions: [{ section: "string", current: "string", suggested: "string" }],
      summary: "string",
      confidence: "0-1"
    },
    jd_text: jdText || "",
    resume: model
  };
  const { normalized, aiReport } = await runAiWithSchemaRecovery(
    "analyze-jd",
    options,
    prompt,
    {
      name: "cn_resume_analyze_jd_result",
      schema: ANALYZE_OUTPUT_JSON_SCHEMA
    },
    (rawReport) => analyzeReportSchemaOrThrow(rawReport)
  );
  return {
    ...normalized,
    ...buildEvalMeta(options, aiReport.confidence)
  };
}

export async function grammarCheckByAI(model, options) {
  const prompt = {
    task: "grammar-check",
    prompt_version: options.promptVersion,
    requirements: {
      issues: [
        {
          sectionId: "string",
          sectionTitle: "string",
          type: "string",
          original: "string",
          suggestion: "string",
          severity: "low|medium|high"
        }
      ],
      score: "0-100",
      summary: "string",
      confidence: "0-1"
    },
    resume: model
  };
  const { normalized, aiReport } = await runAiWithSchemaRecovery(
    "grammar-check",
    options,
    prompt,
    {
      name: "cn_resume_grammar_check_result",
      schema: GRAMMAR_OUTPUT_JSON_SCHEMA
    },
    (rawReport) => grammarReportSchemaOrThrow(rawReport)
  );
  return {
    ...normalized,
    ...buildEvalMeta(options, aiReport.confidence)
  };
}

export function validateByRule(model, jdText, template, options) {
  const evaluated = evaluateScores(model, jdText, template);
  return {
    ...evaluated,
    template,
    quality_gates: computeQualityGates(evaluated.scores),
    ...buildEvalMeta(options, 0.66)
  };
}

export function analyzeByRule(model, jdText, options) {
  const report = analyzeJd(model, jdText);
  return {
    ...report,
    ...buildEvalMeta(options, 0.64)
  };
}

export function grammarByRule(model, options) {
  const report = grammarCheck(model);
  return {
    ...report,
    ...buildEvalMeta(options, 0.62)
  };
}

export async function validateByAI(model, jdText, template, options) {
  return evaluateValidateByAI(model, jdText, template, options);
}
