import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chatCommandModule = await import("../dist/commands/chat.js");
const controllerModule = await import("../dist/chat/controller.js");
const sessionModule = await import("../dist/chat/session.js");

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
