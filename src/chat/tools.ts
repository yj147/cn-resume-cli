import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOptimize, runParse } from "../commands.js";
import { resolveEvalOptions } from "../eval/evaluation.js";
import { runReviewService } from "../eval/review-service.js";
import { createModulePatch, createResumeDraft, RESUME_MODULES } from "../core/patches.js";
import { readJson, writeJson } from "../core/io.js";
import { normalizeLayoutResult } from "../flows/render.js";

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

function buildParseDraft(session, inputPath, model) {
  return createResumeDraft({
    source: "parse-resume",
    summary: "解析结果待确认",
    patches: [
      createModulePatch({
        module: RESUME_MODULES.BASIC,
        previousValue: session?.currentResume?.model?.basic || null,
        nextValue: model.basic || null,
        source: "parsed_exact",
        rollback: {
          strategy: "replace",
          target: "currentResume.model.basic"
        }
      })
    ]
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
        source: "ai_rewritten",
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

function buildLayoutResult(reviewResult) {
  const finding = (reviewResult.findings || []).find((item) => item.category === "layout_quality");
  if (!finding) {
    return null;
  }
  if (finding.severity === "warning" || finding.severity === "blocker" || /超页|一页|版面/.test(String(finding.message || ""))) {
    return normalizeLayoutResult({
      status: "overflow",
      pageCount: 2,
      finding
    });
  }
  return normalizeLayoutResult({
    status: reviewResult.summary?.blocked ? "needs_attention" : "ready",
    pageCount: 1,
    finding
  });
}

function resolveReviewTemplate(session, action) {
  return String(
    action.template ||
    session?.currentTemplate?.templateId ||
    session?.currentResume?.model?.render_config?.template ||
    session?.currentResume?.model?.meta?.template ||
    "elegant"
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
      resumeDraft: buildParseDraft(session, action.inputPath, model),
      artifactPatch: {
        latestModelPath: outputPath,
        latestDraftSourcePath: action.inputPath
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
    const reviewResult = await runReviewService({
      model: session.currentResume.model,
      jdText: String(action.jdText || session.currentJd?.text || ""),
      template: resolveReviewTemplate(session, action),
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
        layoutResult: buildLayoutResult(reviewResult)
      },
      taskPatch: {
        status: reviewResult.summary?.blocked ? "blocked" : "done"
      }
    };
  }

  throw new Error(`unsupported chat tool '${String(action?.type || "")}'`);
}
