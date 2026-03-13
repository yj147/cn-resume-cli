import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chatCommandModule = await import("../dist/commands/chat.js");
const agentModule = await import("../dist/chat/agent.js");
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

test("runChatLoop starts a real 0-1 authoring draft from natural language input", async () => {
  await withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T05:10:00.000Z")
    };

    const authoringInput = [
      "姓名：林青",
      "邮箱：lingqing@example.com",
      "电话：13800000001",
      "目标岗位：资深 UI 设计师",
      "工作经历：2021-03 至今在星海科技负责 B 端设计系统与中后台体验优化。",
      "项目经历：主导组件库重构，设计交付效率提升 40%。",
      "技能：Figma、Sketch、Design Token。"
    ].join("\n");
    const lines = [authoringInput, "/go", "/quit"];

    const result = await chatCommandModule.runChatLoop(runtime, {
      readLine: async () => lines.shift() ?? null,
      write: () => {},
      emit: () => {}
    });

    assert.equal(result.session.workflowState, controllerModule.CHAT_STATES.PENDING_CONFIRMATION);
    assert.equal(result.session.currentResume, undefined);
    assert.equal(result.session.pendingPatches.length > 0, true);
    assert.equal(result.session.pendingPatches.some((patch) => patch.module === "basic"), true);
    assert.equal(result.session.pendingPatches.some((patch) => patch.module === "experience"), true);
    assert.ok(result.session.artifacts.latestModelPath);
    assert.equal(result.session.checkpoints.some((item) => item.key === "authoring_completed"), true);
    assert.equal(result.session.checkpoints.some((item) => item.key === "patch_generated"), true);
  });
});

test("slash patch acceptance stays in pending_confirmation until the last patch is accepted", async () => {
  await withTempHome(async (tempHome) => {
    const handlers = {
      planInput: async () => ({
        type: "plan",
        summary: "优化当前简历",
        action: { type: "optimize-resume" }
      }),
      runTool: async () => ({
        resumeDraft: {
          source: "optimize-resume",
          patches: [
            { patchId: "patch-basic", module: "basic", nextValue: { name: { value: "林青" } } },
            { patchId: "patch-experience", module: "experience", nextValue: [{ company: "星海科技" }] }
          ]
        }
      })
    };
    const io = {
      write: () => {},
      emit: () => {}
    };

    let runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T05:20:00.000Z")
    };

    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "优化当前简历", io, handlers));
    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/go", io, handlers));
    assert.equal(runtime.session.workflowState, controllerModule.CHAT_STATES.PENDING_CONFIRMATION);
    assert.equal(runtime.session.pendingPatches.length, 2);

    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/accept-patch basic", io, handlers));
    assert.equal(runtime.session.workflowState, controllerModule.CHAT_STATES.PENDING_CONFIRMATION);
    assert.equal(runtime.session.pendingPatches.length, 1);
    assert.equal(runtime.session.currentResume.model.basic.name.value, "林青");
    assert.equal(runtime.session.checkpoints.some((item) => item.key === "patch_accepted"), true);

    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/accept-patch experience", io, handlers));
    assert.equal(runtime.session.workflowState, controllerModule.CHAT_STATES.CONFIRMED_CONTENT);
    assert.equal(runtime.session.pendingPatches.length, 0);
    assert.equal(runtime.session.currentResume.model.experience[0].company, "星海科技");
  });
});

test("slash patch rejection records audit trail and returns controller to drafting when last patch is rejected", async () => {
  await withTempHome(async (tempHome) => {
    const handlers = {
      planInput: async () => ({
        type: "plan",
        summary: "优化当前简历",
        action: { type: "optimize-resume" }
      }),
      runTool: async () => ({
        resumeDraft: {
          source: "optimize-resume",
          patches: [
            { patchId: "patch-basic", module: "basic", nextValue: { name: { value: "林青" } } }
          ]
        }
      })
    };
    const io = {
      write: () => {},
      emit: () => {}
    };

    let runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T05:25:00.000Z")
    };

    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "优化当前简历", io, handlers));
    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/go", io, handlers));
    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/reject-patch basic 用户拒绝该改写", io, handlers));

    assert.equal(runtime.session.workflowState, controllerModule.CHAT_STATES.DRAFTING);
    assert.equal(runtime.session.pendingPatches.length, 0);
    assert.equal(runtime.session.currentResume, undefined);
    assert.equal(runtime.session.patchDecisions[0].decision, "rejected");
    assert.equal(runtime.session.patchDecisions[0].reason, "用户拒绝该改写");
    assert.equal(runtime.session.checkpoints.some((item) => item.key === "patch_rejected"), true);
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
    assert.equal(result.session.checkpoints.some((item) => item.key === "layout_overflow"), true);
    assert.deepEqual(
      result.session.layoutResult.options.map((option) => option.id),
      ["accept_multipage", "switch_compact_template", "generate_compaction_patch"]
    );
  });
});

test("export gate blocks unresolved overflow and only explicit multipage approval can reach ready_to_export", () => {
  const session = sessionModule.createChatSession("2026-03-11T08:00:00.000Z");
  session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
  session.currentTemplate = {
    templateId: "elegant",
    source: "user_selected",
    confirmed: true
  };
  session.layoutResult = {
    status: "overflow",
    pageCount: 2,
    templateId: "elegant",
    stable: true,
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
  assert.equal(ready.checkpoints.some((item) => item.key === "layout_decision_recorded"), true);
  assert.equal(ready.checkpoints.some((item) => item.key === "ready_to_export"), true);
});

test("export gate blocks when template has not been explicitly selected", () => {
  const session = sessionModule.createChatSession("2026-03-11T08:15:00.000Z");
  session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
  session.reviewResult = {
    summary: {
      blocked: false
    }
  };
  session.layoutResult = {
    status: "ready",
    pageCount: 1,
    confirmed: true,
    stable: true,
    templateId: "elegant"
  };

  assert.throws(
    () => chatCommandModule.advanceExportWorkflow(session),
    /template_selection_required/
  );
});

test("template change invalidates stale layout results until the chosen template gets a fresh stable layout", () => {
  const session = sessionModule.createChatSession("2026-03-11T08:20:00.000Z");
  session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
  session.reviewResult = {
    summary: {
      blocked: false
    }
  };
  session.currentTemplate = {
    templateId: "elegant",
    source: "user_selected",
    confirmed: true
  };
  session.layoutResult = {
    status: "ready",
    pageCount: 1,
    confirmed: true,
    stable: true,
    templateId: "elegant"
  };
  session.artifacts = {
    templateComparison: {
      comparedTemplateIds: ["elegant", "designer"],
      previews: []
    }
  };

  const switched = agentModule.selectTemplateCandidate(session, "designer");
  assert.equal(switched.currentTemplate.templateId, "designer");
  assert.equal(switched.currentTemplate.confirmed, true);
  assert.equal(switched.layoutResult.stable, false);

  assert.throws(
    () => chatCommandModule.advanceExportWorkflow(switched),
    /layout_stability_required/
  );

  switched.layoutResult = {
    status: "ready",
    pageCount: 1,
    confirmed: true,
    stable: true,
    templateId: "designer"
  };
  const ready = chatCommandModule.advanceExportWorkflow(switched);
  assert.equal(ready.workflowState, controllerModule.CHAT_STATES.READY_TO_EXPORT);
});

test("runChatLoop builds 3-template previews from current resume content and explicit template choice does not mutate confirmed content", async () => {
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
    assert.deepEqual(result.session.artifacts.templateComparison.comparedTemplateIds, ["designer", "creative", "minimal"]);
    assert.equal(result.session.artifacts.templateComparison.previews.length, 3);
    assert.equal(
      result.session.artifacts.templateComparison.previews.every((preview) => preview.html.includes("这是当前用户真实内容的专属摘要")),
      true
    );
    assert.equal(result.session.currentTemplate.templateId, "designer");
    assert.equal(result.session.currentTemplate.source, "ab_selected");
    assert.equal(result.session.currentTemplate.confirmed, true);
    assert.deepEqual(result.session.currentResume.model, originalModel);
    assert.equal(events.some((event) => event.type === "template_comparison_ready"), true);
    assert.equal(events.some((event) => event.type === "template_selected"), true);
    assert.equal(result.session.checkpoints.some((item) => item.key === "template_selected"), true);
  });
});
