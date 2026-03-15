import test from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";

const runModule = await import("../dist/tui/run.js");
const sessionModule = await import("../dist/chat/session.js");

test("runChatTui keeps the brand banner visible in the frame and rerenders on runtime emit", async () => {
  const writes = [];
  const markers = [];
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: {
      ...sessionModule.createChatSession("2026-03-13T16:00:00.000Z"),
      contextRefs: ["resume.md", "jd.md"]
    }
  };
  runtime.session.transcript.push({
    type: "assistant_completed",
    content: "初始欢迎语"
  });

  const tui = await runModule.runChatTui({
    brandText: "SPLASH\nLOGO",
    write: (text) => {
      markers.push(`splash:${text}`);
      writes.push(text);
    },
    loadRuntime: () => runtime,
    renderApp: (tree) => {
      markers.push("frame");
      return render(tree);
    },
    clockText: "14:42:05",
    submitInput: async (currentRuntime, input, io) => {
      currentRuntime.session.transcript.push({
        type: "user_message",
        content: input
      });
      io.emit({
        type: "user_message",
        content: input
      });
      return {
        runtime: currentRuntime,
        exit: false
      };
    }
  });

  assert.equal(writes.length, 0);
  assert.equal(markers[0], "frame");
  assert.match(tui.app.lastFrame() || "", /SPLASH/);
  assert.match(tui.app.lastFrame() || "", /LOGO/);
  assert.match(tui.app.lastFrame() || "", /cn-resume\s+v1\.0\.0/);
  assert.match(tui.app.lastFrame() || "", /v1\.0\.0/);
  assert.match(tui.app.lastFrame() || "", /CONTEXT:\s+2 refs/);
  assert.match(tui.app.lastFrame() || "", /TIME:\s+14:42:05/);
  assert.equal((tui.app.lastFrame() || "").includes("LIVE PREVIEW:"), false);
  assert.match(tui.app.lastFrame() || "", /初始欢迎语/);

  await tui.submit("继续优化");
  assert.match(tui.app.lastFrame() || "", /继续优化/);

  tui.dispose();
});

test("runChatTui enters interactive session when enabled", async () => {
  let interactiveCalls = 0;
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: sessionModule.createChatSession("2026-03-13T16:00:00.000Z")
  };

  const tui = await runModule.runChatTui({
    write: () => {},
    loadRuntime: () => runtime,
    renderApp: (tree) => render(tree),
    interactive: true,
    startInteractiveSession: async (handle) => {
      interactiveCalls += 1;
      assert.equal(typeof handle.submit, "function");
      assert.equal(typeof handle.setDraft, "function");
      return handle;
    }
  });

  assert.equal(interactiveCalls, 1);
  tui.dispose();
});

test("runChatTui exposes inline approval actions for pending plans", async () => {
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: {
      ...sessionModule.createChatSession("2026-03-13T16:00:00.000Z"),
      tasks: [{ id: "task-1", type: "optimize-resume", label: "优化当前简历", status: "waiting_approval" }],
      pendingPlan: {
        summary: "优化当前简历",
        action: { type: "optimize-resume" },
        taskId: "task-1"
      },
      pendingApproval: {
        title: "优化当前简历",
        summary: "优化当前简历",
        action: { type: "optimize-resume" },
        taskId: "task-1"
      }
    }
  };

  const tui = await runModule.runChatTui({
    write: () => {},
    loadRuntime: () => runtime,
    renderApp: (tree) => render(tree),
    handlers: {
      runTool: async () => ({
        sessionPatch: {
          currentResume: {
            sourcePath: "/tmp/resume.json",
            model: { basic: { name: { value: "张三" } } }
          }
        }
      })
    }
  });

  assert.equal(tui.hasPendingApproval(), true);
  await tui.approvePending();
  assert.equal(tui.hasPendingApproval(), false);
  assert.equal(tui.getRuntime().session.currentResume.sourcePath, "/tmp/resume.json");

  tui.dispose();
});

test("runChatTui can cancel pending approval inline", async () => {
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: {
      ...sessionModule.createChatSession("2026-03-13T16:00:00.000Z"),
      pendingPlan: {
        summary: "解析简历文件",
        action: { type: "parse-resume", inputPath: "/tmp/resume.txt" },
        taskId: "task-1"
      },
      pendingApproval: {
        title: "解析简历文件",
        summary: "解析简历文件",
        action: { type: "parse-resume", inputPath: "/tmp/resume.txt" },
        taskId: "task-1"
      }
    }
  };

  const tui = await runModule.runChatTui({
    write: () => {},
    loadRuntime: () => runtime,
    renderApp: (tree) => render(tree)
  });

  assert.equal(tui.hasPendingApproval(), true);
  tui.cancelPending();
  assert.equal(tui.hasPendingApproval(), false);

  tui.dispose();
});
