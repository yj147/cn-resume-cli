import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const commandsModule = await import("../dist/commands.js");
const chatCommandModule = await import("../dist/commands/chat.js");
const agentModule = await import("../dist/chat/agent.js");
const controllerModule = await import("../dist/chat/controller.js");
const sessionModule = await import("../dist/chat/session.js");

async function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-agent-e2e-"));
  try {
    return await run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withTempHome(run) {
  const originalHome = process.env.HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-agent-home-"));
  process.env.HOME = tempHome;
  try {
    return await run(tempHome);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function countOccurrences(text, needle) {
  return String(text).split(needle).length - 1;
}

function acceptAllPendingPatches(session) {
  let next = structuredClone(session);
  while (next.pendingPatches.length) {
    next = agentModule.acceptPendingPatch(next, {
      patchId: next.pendingPatches[0].patchId
    });
  }
  return next;
}

test("parse-first export path blocks unconfirmed facts, review blockers, missing template, and unstable pagination before allowing export", async () => {
  await withTempDir(async (tempDir) => {
    const parsedPath = path.join(tempDir, "parsed.json");
    const awaitingPath = path.join(tempDir, "optimized.await.json");
    const confirmedPath = path.join(tempDir, "optimized.confirmed.json");
    const outputPath = path.join(tempDir, "resume.txt");
    const resumeFixture = path.resolve("fixtures/sample-resume-contract.json");
    const jdFixture = path.resolve("fixtures/sample-jd.txt");

    await commandsModule.runParse({
      input: resumeFixture,
      output: parsedPath
    });
    await commandsModule.runOptimize({
      input: parsedPath,
      jd: jdFixture,
      output: awaitingPath
    });

    await assert.rejects(
      () => commandsModule.runGenerate({ input: awaitingPath, output: outputPath }),
      /phase_b_unconfirmed/
    );

    await commandsModule.runOptimize({
      input: parsedPath,
      jd: jdFixture,
      feedback: "确认导出",
      confirm: true,
      output: confirmedPath
    });

    const confirmedModel = readJson(confirmedPath);

    const reviewBlockedPath = path.join(tempDir, "review-blocked.json");
    writeJson(reviewBlockedPath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: "elegant"
      },
      meta: {
        ...(confirmedModel.meta || {}),
        reviewResult: {
          summary: {
            blocked: true
          }
        },
        layoutResult: {
          status: "ready",
          pageCount: 1,
          confirmed: true
        }
      }
    });
    await assert.rejects(
      () => commandsModule.runGenerate({ input: reviewBlockedPath, output: outputPath }),
      /review_blockers_present/
    );

    const noTemplatePath = path.join(tempDir, "no-template.json");
    writeJson(noTemplatePath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: ""
      },
      meta: {
        ...(confirmedModel.meta || {}),
        template: "",
        reviewResult: {
          summary: {
            blocked: false
          }
        },
        layoutResult: {
          status: "ready",
          pageCount: 1,
          confirmed: true
        }
      }
    });
    await assert.rejects(
      () => commandsModule.runGenerate({ input: noTemplatePath, output: outputPath }),
      /template_selection_required/
    );

    const unconfirmedTemplatePath = path.join(tempDir, "template-unconfirmed.json");
    writeJson(unconfirmedTemplatePath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: "elegant"
      },
      meta: {
        ...(confirmedModel.meta || {}),
        template: "elegant",
        templateConfirmed: false,
        reviewResult: {
          summary: {
            blocked: false
          }
        },
        layoutResult: {
          status: "ready",
          pageCount: 1,
          confirmed: true,
          stable: true,
          templateId: "elegant"
        }
      }
    });
    await assert.rejects(
      () => commandsModule.runGenerate({ input: unconfirmedTemplatePath, output: outputPath }),
      /template_confirmation_required/
    );

    const noLayoutPath = path.join(tempDir, "no-layout.json");
    writeJson(noLayoutPath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: "elegant"
      },
      meta: {
        ...(confirmedModel.meta || {}),
        template: "elegant",
        templateConfirmed: true,
        reviewResult: {
          summary: {
            blocked: false
          }
        },
        layoutResult: null
      }
    });
    await assert.rejects(
      () => commandsModule.runGenerate({ input: noLayoutPath, output: outputPath }),
      /layout_result_required/
    );

    const unstableLayoutPath = path.join(tempDir, "layout-unstable.json");
    writeJson(unstableLayoutPath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: "elegant"
      },
      meta: {
        ...(confirmedModel.meta || {}),
        template: "elegant",
        templateConfirmed: true,
        reviewResult: {
          summary: {
            blocked: false
          }
        },
        layoutResult: {
          status: "ready",
          pageCount: 1,
          confirmed: true,
          stable: false,
          templateId: "elegant"
        }
      }
    });
    await assert.rejects(
      () => commandsModule.runGenerate({ input: unstableLayoutPath, output: outputPath }),
      /layout_stability_required/
    );

    const readyPath = path.join(tempDir, "export-ready.json");
    writeJson(readyPath, {
      ...confirmedModel,
      render_config: {
        ...(confirmedModel.render_config || {}),
        template: "elegant"
      },
      meta: {
        ...(confirmedModel.meta || {}),
        template: "elegant",
        templateConfirmed: true,
        reviewResult: {
          summary: {
            blocked: false
          }
        },
        layoutResult: {
          status: "ready",
          pageCount: 1,
          confirmed: true,
          stable: true,
          templateId: "elegant"
        }
      }
    });

    await commandsModule.runGenerate({
      input: readyPath,
      output: outputPath
    });

    assert.equal(fs.existsSync(outputPath), true);
    assert.equal(fs.readFileSync(outputPath, "utf8").length > 0, true);

    const htmlPath = path.join(tempDir, "resume.html");
    await commandsModule.runGenerate({
      input: readyPath,
      output: htmlPath
    });

    const projectDescription = "负责核心数据服务与权限体系设计。";
    assert.equal(countOccurrences(fs.readFileSync(outputPath, "utf8"), projectDescription), 1);
    assert.equal(countOccurrences(fs.readFileSync(htmlPath, "utf8"), projectDescription), 1);
  });
});

test("0-1 authoring export path blocks pending facts, review blockers and unresolved multipage until explicit approvals complete", async () => {
  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T09:00:00.000Z")
    };
    const authoringInput = [
      "我叫林青，邮箱 lingqing@example.com，电话 13800000001。",
      "目标岗位：资深 UI 设计师。",
      "工作经历：2021-03 至今在星海科技负责 B 端设计系统与中后台体验优化。",
      "项目经历：主导组件库重构，设计交付效率提升 40%。",
      "技能：Figma、Sketch、Design Token。"
    ].join("\n");
    const authoringLines = [authoringInput, "/go", "/quit"];
    const authoringResult = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => authoringLines.shift() ?? null,
        write: () => {},
        emit: () => {}
      }
    );

    assert.equal(authoringResult.session.workflowState, controllerModule.CHAT_STATES.PENDING_CONFIRMATION);
    assert.equal(authoringResult.session.pendingPatches.length > 0, true);

    const accepted = acceptAllPendingPatches(authoringResult.session);
    accepted.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
    accepted.reviewResult = {
      summary: {
        blocked: false
      }
    };
    accepted.layoutResult = {
      status: "overflow",
      pageCount: 2,
      finding: {
        message: "当前内容密度较高，排版存在超页风险。"
      }
    };

    const lines = ["推荐模板对比预览", "/go", "/choose-template designer", "/quit"];
    const result = await chatCommandModule.runChatLoop(
      {
        ...runtime,
        session: accepted
      },
      {
        readLine: async () => lines.shift() ?? null,
        write: () => {},
        emit: () => {}
      }
    );

    const withPendingFacts = structuredClone(result.session);
    withPendingFacts.pendingPatches = [{ patchId: "patch-1", module: "experience" }];
    assert.throws(
      () => chatCommandModule.advanceExportWorkflow(withPendingFacts),
      /patch_confirmation_required/
    );

    const withReviewBlocker = structuredClone(result.session);
    withReviewBlocker.reviewResult = {
      summary: {
        blocked: true
      }
    };
    assert.throws(
      () => chatCommandModule.advanceExportWorkflow(withReviewBlocker),
      /review_blockers_present/
    );

    assert.throws(
      () => chatCommandModule.advanceExportWorkflow(result.session),
      /layout_decision_required/
    );

    const approved = chatCommandModule.confirmLayoutDecision(result.session, "accept_multipage");
    assert.throws(
      () => chatCommandModule.advanceExportWorkflow(approved),
      /layout_stability_required/
    );

    approved.layoutResult = {
      status: "overflow",
      pageCount: 2,
      selectedOption: "accept_multipage",
      confirmed: true,
      stable: true,
      templateId: "designer",
      finding: {
        message: "当前内容密度较高，排版存在超页风险。"
      }
    };
    const ready = chatCommandModule.advanceExportWorkflow(approved);

    assert.equal(ready.workflowState, controllerModule.CHAT_STATES.READY_TO_EXPORT);
    assert.equal(ready.currentTemplate.templateId, "designer");
    assert.match(ready.currentResume.model.basic.title.value, /资深 UI 设计师/);
  });
});
