import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chatCommandModule = await import("../dist/commands/chat.js");
const controllerModule = await import("../dist/chat/controller.js");
const sessionModule = await import("../dist/chat/session.js");
const customTemplateModule = await import("../dist/template/custom-template.js");

function withTempHome(run) {
  const originalHome = process.env.HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-loop-"));
  process.env.HOME = tempHome;

  try {
    return run(tempHome);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

test("runChatLoop executes planned tool after /go and persists active session", async () => {
  assert.equal(typeof chatCommandModule.loadChatRuntime, "function");
  assert.equal(typeof chatCommandModule.runChatLoop, "function");

  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T05:00:00.000Z")
    };

    const lines = ["优化当前简历", "/go", "/quit"];
    const outputs = [];
    const events = [];

    const result = await chatCommandModule.runChatLoop(runtime, {
      readLine: async () => lines.shift() ?? null,
      write: (text) => outputs.push(text),
      emit: (event) => events.push(event)
    }, {
      planInput: async () => ({
        type: "plan",
        summary: "优化当前简历",
        action: { type: "optimize-resume" }
      }),
      runTool: async () => ({
        sessionPatch: {
          currentResume: {
            sourcePath: "/tmp/resume.json",
            model: { basics: { name: "张三" } }
          }
        }
      })
    });

    assert.equal(result.session.state.status, "idle");
    assert.equal(result.session.currentResume.sourcePath, "/tmp/resume.json");
    assert.equal(events.some((item) => item.type === "user_message"), true);
    assert.equal(events.some((item) => item.type === "plan_proposed"), true);
    assert.equal(events.some((item) => item.type === "approval_requested"), true);
    assert.equal(events.some((item) => item.type === "task_started"), true);
    assert.equal(events.some((item) => item.type === "task_finished"), true);

    const activeFile = path.join(tempHome, ".cn-resume", "chat", "active.json");
    assert.equal(fs.existsSync(activeFile), true);
  });
});

test("runChatLoop does not let /cancel bypass pending phase b confirmation", async () => {
  assert.equal(typeof chatCommandModule.runChatLoop, "function");

  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T05:30:00.000Z")
    };
    runtime.session.state = { status: "waiting_phase_b_feedback" };
    runtime.session.phaseB = {
      status: "awaiting_feedback",
      prompt: "请确认 Phase B"
    };

    const lines = ["/cancel", "/quit"];
    const outputs = [];
    const events = [];

    const result = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => lines.shift() ?? null,
        write: (text) => outputs.push(text),
        emit: (event) => events.push(event)
      },
      {}
    );

    assert.equal(result.session.state.status, "waiting_phase_b_feedback");
    assert.equal(result.session.phaseB.status, "awaiting_feedback");
    assert.equal(events.some((item) => item.type === "error"), true);
  });
});

test("runChatLoop records error once when agent already attaches error session", async () => {
  assert.equal(typeof chatCommandModule.runChatLoop, "function");

  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T06:00:00.000Z")
    };

    const lines = ["优化当前简历", "/go", "/quit"];
    const outputs = [];
    const events = [];

    const result = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => lines.shift() ?? null,
        write: (text) => outputs.push(text),
        emit: (event) => events.push(event)
      },
      {
        planInput: async () => ({
          type: "plan",
          summary: "优化当前简历",
          action: { type: "optimize-resume" }
        }),
        runTool: async () => {
          throw new Error("mock tool failed");
        }
      }
    );

    const errorMessages = result.session.messages.filter((item) => item.role === "error");
    assert.equal(errorMessages.length, 1);
    assert.match(errorMessages[0].content, /mock tool failed/);
    assert.equal(events.filter((item) => item.type === "error").length, 1);
  });
});

test("runChatLoop persists controller workflow state after patch generation", async () => {
  assert.equal(typeof chatCommandModule.runChatLoop, "function");

  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T06:30:00.000Z")
    };
    const lines = ["优化当前简历", "/go", "/quit"];

    const result = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => lines.shift() ?? null,
        write: () => {},
        emit: () => {}
      },
      {
        planInput: async () => ({
          type: "plan",
          summary: "优化当前简历",
          action: { type: "optimize-resume" }
        }),
        runTool: async () => ({
          resumeDraft: {
            patches: [
              {
                module: "experience",
                nextValue: [{ company: "Acme" }]
              }
            ]
          }
        })
      }
    );

    assert.equal(result.session.workflowState, controllerModule.CHAT_STATES.PENDING_CONFIRMATION);
    assert.equal(result.session.pendingPatches.length, 1);
  });
});

test("runChatLoop emits explicit overflow events and pending layout choices", async () => {
  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T07:00:00.000Z")
    };
    runtime.session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
    runtime.session.pendingPlan = {
      summary: "审核当前简历",
      action: { type: "review-resume", engine: "rule" },
      taskId: "task-review-overflow"
    };
    runtime.session.pendingApproval = {
      title: "审核当前简历",
      summary: "审核当前简历",
      action: { type: "review-resume", engine: "rule" },
      taskId: "task-review-overflow"
    };
    runtime.session.tasks = [
      {
        id: "task-review-overflow",
        type: "review-resume",
        label: "审核当前简历",
        status: "waiting_approval"
      }
    ];

    const events = [];
    const lines = ["/go", "/quit"];
    const result = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => lines.shift() ?? null,
        write: () => {},
        emit: (event) => events.push(event)
      },
      {
        runTool: async () => ({
          sessionPatch: {
            layoutResult: {
              status: "overflow",
              pageCount: 2,
              finding: {
                message: "当前内容密度较高，排版存在超页风险。"
              }
            }
          }
        })
      }
    );

    assert.equal(result.session.workflowState, controllerModule.CHAT_STATES.LAYOUT_SOLVING);
    assert.equal(events.some((event) => event.type === "layout_overflow"), true);
    assert.equal(events.some((event) => event.type === "layout_decision_requested"), true);
    assert.equal(result.session.layoutResult.status, "overflow");
    assert.equal(result.session.layoutResult.confirmed, false);
    assert.deepEqual(
      result.session.layoutResult.options.map((option) => option.id),
      ["accept_multipage", "switch_compact_template", "generate_compaction_patch"]
    );
  });
});

test("export gate blocks unresolved overflow and only explicit multipage approval can reach ready_to_export", () => {
  const session = sessionModule.createChatSession("2026-03-11T08:00:00.000Z");
  session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
  session.layoutResult = {
    status: "overflow",
    pageCount: 2,
    finding: {
      message: "当前内容密度较高，排版存在超页风险。"
    }
  };

  assert.throws(
    () => chatCommandModule.advanceExportWorkflow(session),
    /layout_decision_required/
  );

  const compactChoice = chatCommandModule.confirmLayoutDecision(session, "switch_compact_template");
  assert.throws(
    () => chatCommandModule.advanceExportWorkflow(compactChoice),
    /layout_action_pending/
  );

  const multipageApproved = chatCommandModule.confirmLayoutDecision(session, "accept_multipage");
  const ready = chatCommandModule.advanceExportWorkflow(multipageApproved);

  assert.equal(ready.workflowState, controllerModule.CHAT_STATES.READY_TO_EXPORT);
  assert.equal(ready.layoutResult.selectedOption, "accept_multipage");
  assert.equal(ready.layoutResult.confirmed, true);
});

test("runChatLoop builds A/B previews from current resume content and explicit template choice does not mutate confirmed content", async () => {
  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T08:30:00.000Z")
    };
    const model = customTemplateModule.createTemplatePreviewSample();
    model.basic.title.value = "资深 UI 设计师";
    model.basic.summary.value = "这是当前用户真实内容的专属摘要";
    const originalModel = structuredClone(model);
    runtime.session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
    runtime.session.currentResume = {
      sourcePath: "/tmp/resume.json",
      model
    };

    const lines = ["推荐模板对比预览", "/go", "/choose-template designer", "/quit"];
    const events = [];

    const result = await chatCommandModule.runChatLoop(
      runtime,
      {
        readLine: async () => lines.shift() ?? null,
        write: () => {},
        emit: (event) => events.push(event)
      }
    );

    assert.equal(result.session.artifacts.templateComparison.source, "current_resume");
    assert.deepEqual(result.session.artifacts.templateComparison.comparedTemplateIds, ["designer", "creative"]);
    assert.equal(result.session.artifacts.templateComparison.previews.length, 2);
    assert.equal(
      result.session.artifacts.templateComparison.previews.every((preview) => preview.html.includes("这是当前用户真实内容的专属摘要")),
      true
    );
    assert.equal(result.session.currentTemplate.templateId, "designer");
    assert.equal(result.session.currentTemplate.source, "ab_selected");
    assert.deepEqual(result.session.currentResume.model, originalModel);
    assert.equal(events.some((event) => event.type === "template_comparison_ready"), true);
    assert.equal(events.some((event) => event.type === "template_selected"), true);
  });
});
