import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configModule = await import("../dist/chat/config.js");
const sessionModule = await import("../dist/chat/session.js");
const controllerModule = await import("../dist/chat/controller.js");
const envModule = await import("../dist/env.js");
const chatCommandModule = await import("../dist/commands/chat.js");

function withTempHome(run) {
  const originalHome = process.env.HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-chat-"));
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

test("loadChatConfig returns empty values when ai.env is missing", () => {
  return withTempHome(() => {
    assert.equal(typeof configModule.loadChatConfig, "function");

    const config = configModule.loadChatConfig();
    assert.deepEqual(config, {
      apiKey: "",
      baseUrl: "",
      model: ""
    });
  });
});

test("saveChatConfig persists ai.env and loadLocalEnvFile can read it", () => {
  return withTempHome((tempHome) => {
    assert.equal(typeof configModule.saveChatConfig, "function");

    configModule.saveChatConfig({
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "gpt-4.1-mini"
    });

    const envFile = path.join(tempHome, ".cn-resume", "ai.env");
    assert.equal(fs.existsSync(envFile), true);
    assert.match(fs.readFileSync(envFile, "utf8"), /CN_RESUME_API_KEY=test-key/);
    assert.match(fs.readFileSync(envFile, "utf8"), /CN_RESUME_BASE_URL=http:\/\/127\.0\.0\.1:11434\/v1/);
    assert.match(fs.readFileSync(envFile, "utf8"), /CN_RESUME_AI_MODEL=gpt-4.1-mini/);

    delete process.env.CN_RESUME_API_KEY;
    delete process.env.CN_RESUME_BASE_URL;
    delete process.env.CN_RESUME_AI_MODEL;

    envModule.loadLocalEnvFile();

    assert.equal(process.env.CN_RESUME_API_KEY, "test-key");
    assert.equal(process.env.CN_RESUME_BASE_URL, "http://127.0.0.1:11434/v1");
    assert.equal(process.env.CN_RESUME_AI_MODEL, "gpt-4.1-mini");
  });
});

test("loadActiveSession creates an empty session when active.json is missing", () => {
  return withTempHome(() => {
    assert.equal(typeof sessionModule.loadActiveSession, "function");

    const session = sessionModule.loadActiveSession();
    assert.ok(session.meta);
    assert.match(session.meta.id, /^session-/);
    assert.equal(session.meta.title, "");
    assert.equal(typeof session.meta.createdAt, "string");
    assert.equal(typeof session.meta.updatedAt, "string");
    assert.equal(typeof session.meta.cwd, "string");
    assert.deepEqual(session.tasks, []);
    assert.equal(session.pendingApproval, undefined);
    assert.deepEqual(session.contextRefs, []);
    assert.deepEqual(session.selection, {
      pane: "transcript",
      entityId: "",
      detailsTab: "plan"
    });
    assert.equal(session.composerDraft, "");
    assert.equal(session.workflowState, controllerModule.CHAT_STATES.INTAKE);
    assert.equal(session.reviewResult, null);
    assert.equal(session.layoutResult, null);
    assert.equal(session.currentTemplate, null);
    assert.deepEqual(session.checkpoints, []);

    assert.match(session.id, /^session-/);
    assert.equal(session.messages.length, 0);
    assert.equal(session.transcript.length, 0);
    assert.deepEqual(session.artifacts, {});
    assert.deepEqual(session.state, { status: "idle" });
  });
});

test("saveActiveSession and saveNamedSession persist session state", () => {
  return withTempHome((tempHome) => {
    assert.equal(typeof sessionModule.saveActiveSession, "function");
    assert.equal(typeof sessionModule.saveNamedSession, "function");
    assert.equal(typeof sessionModule.loadNamedSession, "function");

    const session = sessionModule.createChatSession();
    session.messages.push({ role: "user", content: "优化我的简历" });
    session.meta.title = "demo-workbench";
    session.tasks = [{ id: "task-1", status: "done" }];
    session.pendingApproval = { id: "approval-1", title: "确认执行优化" };
    session.contextRefs = [{ type: "file", value: "/tmp/resume.pdf" }];
    session.selection = {
      pane: "details",
      entityId: "task-1",
      detailsTab: "approval"
    };
    session.composerDraft = "继续优化量化结果";
    session.currentResume = {
      sourcePath: "/tmp/resume.pdf",
      model: { basics: { name: "张三" } }
    };
    session.workflowState = controllerModule.CHAT_STATES.READY_TO_EXPORT;
    session.reviewResult = {
      status: "warning",
      blockers: [],
      warnings: ["量化结果不足"]
    };
    session.layoutResult = {
      status: "overflow",
      pageCount: 2
    };
    session.currentTemplate = {
      templateId: "single-clean",
      source: "user_selected"
    };
    session.checkpoints = [
      {
        key: "patch_accepted",
        workflowState: controllerModule.CHAT_STATES.CONFIRMED_CONTENT,
        stable: true
      },
      {
        key: "layout_resolved",
        workflowState: controllerModule.CHAT_STATES.READY_TO_EXPORT,
        stable: true
      }
    ];

    const savedActive = sessionModule.saveActiveSession(session);
    const namedSession = sessionModule.saveNamedSession("demo", savedActive);
    const reloaded = sessionModule.loadNamedSession("demo");
    const rawActive = JSON.parse(fs.readFileSync(path.join(tempHome, ".cn-resume", "chat", "active.json"), "utf8"));

    assert.equal(fs.existsSync(path.join(tempHome, ".cn-resume", "chat", "active.json")), true);
    assert.equal(fs.existsSync(path.join(tempHome, ".cn-resume", "chat", "sessions", "demo.json")), true);
    assert.equal(reloaded.messages.length, 1);
    assert.equal(reloaded.transcript.length, 1);
    assert.equal(reloaded.meta.title, "demo-workbench");
    assert.deepEqual(reloaded.tasks, [{ id: "task-1", status: "done" }]);
    assert.deepEqual(reloaded.pendingApproval, { id: "approval-1", title: "确认执行优化" });
    assert.deepEqual(reloaded.contextRefs, [{ type: "file", value: "/tmp/resume.pdf" }]);
    assert.deepEqual(reloaded.selection, {
      pane: "details",
      entityId: "task-1",
      detailsTab: "approval"
    });
    assert.equal(reloaded.composerDraft, "继续优化量化结果");
    assert.equal(reloaded.currentResume.sourcePath, "/tmp/resume.pdf");
    assert.equal(reloaded.workflowState, controllerModule.CHAT_STATES.READY_TO_EXPORT);
    assert.deepEqual(reloaded.reviewResult, {
      status: "warning",
      blockers: [],
      warnings: ["量化结果不足"]
    });
    assert.deepEqual(reloaded.layoutResult, {
      status: "overflow",
      pageCount: 2
    });
    assert.deepEqual(reloaded.currentTemplate, {
      templateId: "single-clean",
      source: "user_selected"
    });
    assert.deepEqual(reloaded.checkpoints, [
      {
        key: "patch_accepted",
        workflowState: controllerModule.CHAT_STATES.CONFIRMED_CONTENT,
        stable: true
      },
      {
        key: "layout_resolved",
        workflowState: controllerModule.CHAT_STATES.READY_TO_EXPORT,
        stable: true
      }
    ]);
    assert.equal(Object.hasOwn(rawActive, "workflowState"), true);
    assert.equal(Object.hasOwn(rawActive, "reviewResult"), true);
    assert.equal(Object.hasOwn(rawActive, "layoutResult"), true);
    assert.equal(Object.hasOwn(rawActive, "currentTemplate"), true);
    assert.equal(Object.hasOwn(rawActive, "checkpoints"), true);
    assert.equal(Object.hasOwn(rawActive, "state"), false);
    assert.equal(namedSession.meta.updatedAt, savedActive.meta.updatedAt);
  });
});

test("loadActiveSession normalizes legacy session shape into workbench defaults", () => {
  return withTempHome((tempHome) => {
    const chatDir = path.join(tempHome, ".cn-resume", "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(
      path.join(chatDir, "active.json"),
      JSON.stringify(
        {
          id: "legacy-001",
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:01:00.000Z",
          messages: [{ role: "user", content: "legacy hello" }],
          state: { status: "idle" },
          artifacts: { latestModelPath: "/tmp/model.json" }
        },
        null,
        2
      ),
      "utf8"
    );

    const session = sessionModule.loadActiveSession();
    assert.equal(session.id, "legacy-001");
    assert.equal(session.meta.id, "legacy-001");
    assert.equal(session.messages.length, 1);
    assert.equal(session.transcript.length, 1);
    assert.equal(session.artifacts.latestModelPath, "/tmp/model.json");
    assert.deepEqual(session.tasks, []);
    assert.equal(session.pendingApproval, undefined);
    assert.deepEqual(session.contextRefs, []);
    assert.equal(session.workflowState, controllerModule.CHAT_STATES.INTAKE);
    assert.equal(session.reviewResult, null);
    assert.equal(session.layoutResult, null);
    assert.equal(session.currentTemplate, null);
    assert.deepEqual(session.checkpoints, []);
    assert.deepEqual(session.selection, {
      pane: "transcript",
      entityId: "",
      detailsTab: "plan"
    });
    assert.equal(session.composerDraft, "");
  });
});

test("loadActiveSession restores workflow state from latest stable checkpoint when explicit workflowState is missing", () => {
  return withTempHome((tempHome) => {
    const chatDir = path.join(tempHome, ".cn-resume", "chat");
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(
      path.join(chatDir, "active.json"),
      JSON.stringify(
        {
          id: "legacy-002",
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:01:00.000Z",
          checkpoints: [
            {
              key: "patch_generated",
              workflowState: controllerModule.CHAT_STATES.PENDING_CONFIRMATION,
              stable: true
            },
            {
              key: "review_done",
              workflowState: controllerModule.CHAT_STATES.READY_TO_EXPORT,
              stable: true
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const session = sessionModule.loadActiveSession();
    assert.equal(session.workflowState, controllerModule.CHAT_STATES.READY_TO_EXPORT);
    assert.deepEqual(session.checkpoints, [
      {
        key: "patch_generated",
        workflowState: controllerModule.CHAT_STATES.PENDING_CONFIRMATION,
        stable: true
      },
      {
        key: "review_done",
        workflowState: controllerModule.CHAT_STATES.READY_TO_EXPORT,
        stable: true
      }
    ]);
  });
});

test("auto-generated checkpoints persist across save and reload", async () => {
  await withTempHome(async (tempHome) => {
    let runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T07:45:00.000Z")
    };
    const io = {
      emit: () => {},
      write: () => {}
    };
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

    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "优化当前简历", io, handlers));
    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/go", io, handlers));
    ({ runtime } = await chatCommandModule.submitChatInput(runtime, "/accept-patch basic", io, handlers));

    const activeFile = path.join(tempHome, ".cn-resume", "chat", "active.json");
    const rawActive = JSON.parse(fs.readFileSync(activeFile, "utf8"));
    const reloaded = sessionModule.loadActiveSession(tempHome);

    assert.equal(rawActive.checkpoints.some((item) => item.key === "patch_generated"), true);
    assert.equal(rawActive.checkpoints.some((item) => item.key === "patch_accepted"), true);
    assert.equal(reloaded.checkpoints.some((item) => item.key === "patch_generated"), true);
    assert.equal(reloaded.checkpoints.some((item) => item.key === "patch_accepted"), true);
    assert.equal(reloaded.workflowState, controllerModule.CHAT_STATES.CONFIRMED_CONTENT);
  });
});

test("syncSessionState keeps state.status as a derived ui view instead of persisted workflow truth", () => {
  const session = sessionModule.createChatSession("2026-03-11T08:05:00.000Z");
  session.workflowState = controllerModule.CHAT_STATES.CONFIRMED_CONTENT;
  session.pendingApproval = {
    title: "确认计划",
    summary: "确认计划",
    action: { type: "optimize-resume" },
    taskId: "task-derive-1"
  };

  const synced = sessionModule.syncSessionState(session);
  assert.equal(synced.workflowState, controllerModule.CHAT_STATES.CONFIRMED_CONTENT);
  assert.equal(synced.state.status, controllerModule.CHAT_STATES.WAITING_CONFIRM);
});
