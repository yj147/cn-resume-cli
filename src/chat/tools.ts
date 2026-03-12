import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOptimize, runParse } from "../commands.js";
import { createModulePatch, createResumeDraft, RESUME_MODULES } from "../core/patches.js";
import { readJson, writeJson } from "../core/io.js";

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
      resumeDraft: createResumeDraft({
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
      }),
      sessionPatch: {
        currentResume: {
          sourcePath: action.inputPath,
          model
        }
      },
      artifactPatch: {
        latestModelPath: outputPath
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
      resumeDraft: createResumeDraft({
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
      }),
      sessionPatch: {
        currentResume: {
          sourcePath: session.currentResume.sourcePath,
          model
        },
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

  throw new Error(`unsupported chat tool '${String(action?.type || "")}'`);
}
