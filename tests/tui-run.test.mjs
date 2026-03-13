import test from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";

const runModule = await import("../dist/tui/run.js");
const sessionModule = await import("../dist/chat/session.js");

test("runChatTui prints splash once before the first frame and rerenders on runtime emit", async () => {
  const writes = [];
  const markers = [];
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "" },
    session: sessionModule.createChatSession("2026-03-13T16:00:00.000Z")
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

  assert.equal(writes.length, 1);
  assert.equal(markers[0].startsWith("splash:"), true);
  assert.match(tui.app.lastFrame() || "", /初始欢迎语/);

  await tui.submit("继续优化");
  assert.match(tui.app.lastFrame() || "", /继续优化/);

  tui.dispose();
});
