import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOptimize, runParse } from "../commands.js";
import { resolveEvalOptions } from "../eval/evaluation.js";
import { runReviewService } from "../eval/review-service.js";
import { createModulePatch, createResumeDraft, RESUME_MODULES } from "../core/patches.js";
import { readJson, writeJson } from "../core/io.js";
import { FIELD_SOURCES } from "../core/provenance.js";
import { buildLayoutResult } from "../flows/render.js";
import { parseTextToModel } from "../flows/parse-optimize.js";
import { renderTemplate } from "../template/custom-template.js";
import { recommendTemplates } from "../template/recommend.js";

const DRAFT_MODULE_ORDER = [
  RESUME_MODULES.BASIC,
  RESUME_MODULES.EXPERIENCE,
  RESUME_MODULES.PROJECTS,
  RESUME_MODULES.EDUCATION,
  RESUME_MODULES.SKILLS,
  RESUME_MODULES.CERTIFICATIONS,
  RESUME_MODULES.LANGUAGES,
  RESUME_MODULES.GITHUB,
  RESUME_MODULES.QR_CODES,
  RESUME_MODULES.CUSTOM_SECTIONS
];

function createToolWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-chat-tool-"));
}

function buildToolFlags(action, extraFlags: Record<string, any> = {}) {
  const flags: Record<string, any> = {
    ...extraFlags
  };
  if (action.engine) {
    flags.engine = action.engine;
  }
  if (action.model) {
    flags.model = action.model;
  }
  if (action.promptVersion) {
    flags["prompt-version"] = action.promptVersion;
  }
  return flags;
}

function hasFieldContent(value) {
  return String(value?.value || "").trim().length > 0;
}

function moduleHasContent(moduleName, value) {
  if (moduleName === RESUME_MODULES.BASIC) {
    return value && typeof value === "object" && Object.values(value).some((field) => hasFieldContent(field));
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function buildDraftFromModel(session, model, summary, draftSource, patchSource) {
  return createResumeDraft({
    source: draftSource,
    summary,
    patches: DRAFT_MODULE_ORDER
      .filter((moduleName) => moduleHasContent(moduleName, model?.[moduleName]))
      .map((moduleName) =>
        createModulePatch({
          module: moduleName,
          previousValue: session?.currentResume?.model?.[moduleName] || null,
          nextValue: model?.[moduleName] || null,
          source: patchSource,
          rollback: {
            strategy: "replace",
            target: `currentResume.model.${moduleName}`
          }
        })
      )
  });
}

function buildOptimizeDraft(session, model, phaseBStatus) {
  return createResumeDraft({
    source: "optimize-resume",
    summary: "优化结果待确认",
    patches: [
      createModulePatch({
        module: RESUME_MODULES.EXPERIENCE,
        previousValue: session.currentResume.model?.experience || null,
        nextValue: model.experience || null,
        source: FIELD_SOURCES.AI_REWRITTEN,
        severity: phaseBStatus === "awaiting_feedback" ? "warning" : "info",
        rollback: {
          strategy: "replace",
          target: "currentResume.model.experience"
        }
      })
    ]
  });
}

function reviewModuleFor(finding) {
  if (finding.category === "layout_quality") {
    return RESUME_MODULES.RENDER_CONFIG;
  }
  if (finding.category === "fact_consistency") {
    return RESUME_MODULES.BASIC;
  }
  return RESUME_MODULES.EXPERIENCE;
}

function buildAdoptablePatches(reviewResult) {
  return (reviewResult.suggestions || []).slice(0, 5).map((finding, index) => ({
    patchId: `review-patch-${index + 1}`,
    module: reviewModuleFor(finding),
    source: finding.source,
    severity: finding.severity,
    summary: finding.message,
    recommendedFeedback: finding.message
  }));
}

function resolveReviewTemplate(session, action) {
  return String(
    action.template ||
    session?.currentTemplate?.templateId ||
    session?.currentResume?.model?.render_config?.template ||
    session?.currentResume?.model?.meta?.template ||
    "single-clean"
  );
}

export async function runChatTool(action, session) {
  if (action.type === "parse-resume") {
    const workspace = createToolWorkspace();
    const outputPath = path.join(workspace, "parsed.json");
    await runParse(
      buildToolFlags(action, {
        input: action.inputPath,
        output: outputPath
      })
    );
    const model = readJson(outputPath);
    return {
      resumeDraft: buildDraftFromModel(
        session,
        model,
        "解析结果待确认",
        "parse-resume",
        FIELD_SOURCES.PARSED_EXACT
      ),
      artifactPatch: {
        latestModelPath: outputPath,
        latestDraftSourcePath: action.inputPath
      },
      taskPatch: {
        status: "done"
      }
    };
  }

  if (action.type === "author-resume") {
    const workspace = createToolWorkspace();
    const inputPath = path.join(workspace, "authoring.txt");
    const outputPath = path.join(workspace, "authored.json");
    const inputText = String(action.inputText || "").trim();
    fs.writeFileSync(inputPath, inputText, "utf8");
    const model = parseTextToModel(inputText);
    writeJson(outputPath, model);
    return {
      resumeDraft: buildDraftFromModel(
        session,
        model,
        "根据口述内容生成结构化简历草稿",
        "author-resume",
        FIELD_SOURCES.PARSED_EXACT
      ),
      artifactPatch: {
        latestModelPath: outputPath,
        latestDraftSourcePath: inputPath
      },
      taskPatch: {
        status: "done"
      }
    };
  }

  if (action.type === "optimize-resume") {
    if (!session?.currentResume?.model) {
      throw new Error("BLOCKED: no current resume loaded");
    }
    const workspace = createToolWorkspace();
    const inputPath = path.join(workspace, "resume.json");
    const outputPath = path.join(workspace, "optimized.json");
    writeJson(inputPath, session.currentResume.model);

    const flags = buildToolFlags(action, {
      input: inputPath,
      output: outputPath,
      feedback: String(action.feedbackText || ""),
      confirm: Boolean(action.confirm)
    });

    if (action.jdText) {
      const jdPath = path.join(workspace, "jd.txt");
      fs.writeFileSync(jdPath, action.jdText, "utf8");
      flags.jd = jdPath;
    }

    await runOptimize(flags);

    const model = readJson(outputPath);
    const phaseB = model?.meta?.phase_b;
    const phaseBStatus = phaseB ? (phaseB.confirmed ? "confirmed" : "awaiting_feedback") : undefined;
    return {
      resumeDraft: action.confirm ? undefined : buildOptimizeDraft(session, model, phaseBStatus),
      sessionPatch: {
        currentJd: action.jdText
          ? {
              path: "",
              text: action.jdText
            }
          : session.currentJd
      },
      artifactPatch: {
        latestModelPath: outputPath
      },
      taskPatch: {
        status: phaseBStatus === "awaiting_feedback" ? "waiting_phase_b_feedback" : "done"
      },
      phaseB: phaseBStatus
        ? {
            runId: phaseB.run_id,
            status: phaseBStatus,
            prompt: phaseB.asked_question,
            diff: phaseB.diff
          }
        : undefined
    };
  }

  if (action.type === "review-resume") {
    if (!session?.currentResume?.model) {
      throw new Error("BLOCKED: no current resume loaded");
    }
    const reviewTemplate = resolveReviewTemplate(session, action);
    const reviewResult = await runReviewService({
      model: session.currentResume.model,
      jdText: String(action.jdText || session.currentJd?.text || ""),
      template: reviewTemplate,
      options: resolveEvalOptions(buildToolFlags(action)),
      checks: action.checks
    });
    const adoptablePatches = buildAdoptablePatches(reviewResult);
    return {
      sessionPatch: {
        reviewResult: {
          ...reviewResult,
          adoptablePatches
        },
        layoutResult: buildLayoutResult(
          session.currentResume.model,
          reviewResult,
          reviewTemplate,
          session?.currentTemplate?.confirmed === true && session?.currentTemplate?.templateId === reviewTemplate
        )
      },
      taskPatch: {
        status: reviewResult.summary?.blocked ? "blocked" : "done"
      }
    };
  }

  if (action.type === "recommend-template") {
    if (!session?.currentResume?.model) {
      throw new Error("BLOCKED: no current resume loaded");
    }

    const recommendation = recommendTemplates({
      model: session.currentResume.model,
      reviewResult: session.reviewResult,
      preferences: action.preferences || {}
    });
    const comparedTemplateIds = recommendation.candidates.slice(0, 3).map((candidate) => candidate.templateId);
    const previews = [];

    for (const templateId of comparedTemplateIds) {
      const rendered = await renderTemplate(session.currentResume.model, templateId, false);
      previews.push({
        templateId,
        html: rendered.html
      });
    }

    return {
      artifactPatch: {
        templateRecommendation: recommendation,
        templateComparison: {
          comparedTemplateIds,
          previews,
          source: "current_resume",
          generatedAt: new Date().toISOString()
        }
      },
      taskPatch: {
        status: "done"
      }
    };
  }

  throw new Error(`unsupported chat tool '${String(action?.type || "")}'`);
}
