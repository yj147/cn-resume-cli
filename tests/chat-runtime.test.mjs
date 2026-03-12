import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configModule = await import("../dist/chat/config.js");
const sessionModule = await import("../dist/chat/session.js");
const runtimeModule = await import("../dist/commands/chat.js");
const controllerModule = await import("../dist/chat/controller.js");

function withTempHome(run) {
  const originalHome = process.env.HOME;
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-runtime-"));
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

test("loadChatRuntime loads active session and config by default", () => {
  return withTempHome((tempHome) => {
    assert.equal(typeof runtimeModule.loadChatRuntime, "function");

    configModule.saveChatConfig({
      apiKey: "key-1",
      baseUrl: "http://localhost:11434/v1",
      model: "gpt-4.1-mini"
    });

    const active = sessionModule.createChatSession("2026-03-11T01:00:00.000Z");
    active.messages.push({ role: "user", content: "hello" });
    sessionModule.saveActiveSession(active);

    const runtime = runtimeModule.loadChatRuntime({}, { homeDir: tempHome });
    assert.equal(runtime.config.model, "gpt-4.1-mini");
    assert.equal(runtime.session.id, active.id);
    assert.equal(runtime.session.messages.length, 1);
  });
});

test("loadChatRuntime loads named session when resume flag is provided", () => {
  return withTempHome((tempHome) => {
    assert.equal(typeof runtimeModule.loadChatRuntime, "function");

    const active = sessionModule.createChatSession("2026-03-11T01:00:00.000Z");
    const named = sessionModule.createChatSession("2026-03-11T02:00:00.000Z");
    named.messages.push({ role: "user", content: "resume me" });

    sessionModule.saveActiveSession(active);
    sessionModule.saveNamedSession("demo", named);

    const runtime = runtimeModule.loadChatRuntime({ resume: "demo" }, { homeDir: tempHome });
    assert.equal(runtime.session.id, named.id);
    assert.equal(runtime.session.messages[0].content, "resume me");
  });
});

test("submitChatInput emits user_message and assistant_completed events on answer flow", async () => {
  return withTempHome(async (tempHome) => {
    assert.equal(typeof runtimeModule.submitChatInput, "function");

    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T06:00:00.000Z")
    };
    const events = [];

    const result = await runtimeModule.submitChatInput(
      runtime,
      "你好",
      {
        emit: (event) => events.push(event),
        write: () => {
          throw new Error("write should not be used when emit exists");
        }
      },
      {
        planInput: async () => ({
          type: "answer",
          message: "这是回答"
        })
      }
    );

    assert.equal(result.exit, false);
    assert.equal(events[0].type, "user_message");
    assert.equal(events.at(-1).type, "assistant_completed");
    assert.equal(result.runtime.session.transcript.some((item) => item.type === "assistant_completed"), true);
  });
});

test("submitChatInput routes plan requests through controller workflow transitions", async () => {
  return withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T07:00:00.000Z")
    };

    const result = await runtimeModule.submitChatInput(
      runtime,
      "优化当前简历",
      {
        emit: () => {},
        write: () => {}
      },
      {
        planInput: async () => ({
          type: "plan",
          summary: "优化当前简历",
          action: { type: "optimize-resume" }
        })
      }
    );

    assert.equal(result.runtime.session.workflowState, controllerModule.CHAT_STATES.DRAFTING);
    assert.equal(result.runtime.session.state.status, controllerModule.CHAT_STATES.WAITING_CONFIRM);
  });
});

test("submitChatInput blocks illegal workflow transitions explicitly", async () => {
  return withTempHome(async (tempHome) => {
    const runtime = {
      homeDir: tempHome,
      config: { apiKey: "", baseUrl: "", model: "" },
      session: sessionModule.createChatSession("2026-03-11T07:30:00.000Z")
    };
    runtime.session.workflowState = controllerModule.CHAT_STATES.BLOCKED;

    await assert.rejects(
      () => runtimeModule.submitChatInput(
        runtime,
        "继续优化",
        {
          emit: () => {},
          write: () => {}
        },
        {
          planInput: async () => ({
            type: "plan",
            summary: "继续优化",
            action: { type: "optimize-resume" }
          })
        }
      ),
      /BLOCKED: invalid controller transition/
    );
  });
});
