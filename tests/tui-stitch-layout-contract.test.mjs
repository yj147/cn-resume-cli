import test from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";

const runModule = await import("../dist/tui/run.js");
const sessionModule = await import("../dist/chat/session.js");

test("tui frame keeps stitch-aligned top bar, split panes, and bottom composer in order", async () => {
  const runtime = {
    homeDir: process.cwd(),
    config: { apiKey: "", baseUrl: "", model: "claude-3-5-sonnet-20241022" },
    session: {
      ...sessionModule.createChatSession("2026-03-14T05:37:12.000Z"),
      pendingPatches: [{ patchId: "patch-1" }]
    }
  };
  runtime.session.transcript.push(
    { type: "assistant_completed", content: "欢迎回来。" },
    { type: "user_message", content: "优化技能区" }
  );

  const tui = await runModule.runChatTui({
    write: () => {},
    loadRuntime: () => runtime,
    renderApp: (tree) => render(tree)
  });

  const frame = tui.app.lastFrame() || "";
  const topBorderIndex = frame.indexOf("╭");
  const brandIndex = frame.indexOf("██████╗");
  const topBarIndex = frame.indexOf("cn-resume");
  const transcriptIndex = frame.indexOf("● cn-resume");
  const previewIndex = frame.indexOf("LIVE PREVIEW:");
  const composerIndex = frame.indexOf("TAB Auto-complete");

  assert.notEqual(topBorderIndex, -1);
  assert.notEqual(brandIndex, -1);
  assert.notEqual(topBarIndex, -1);
  assert.notEqual(transcriptIndex, -1);
  assert.notEqual(previewIndex, -1);
  assert.notEqual(composerIndex, -1);
  assert.equal(topBorderIndex < topBarIndex, true);
  assert.equal(topBarIndex < brandIndex, true);
  assert.equal(brandIndex < transcriptIndex, true);
  assert.equal(transcriptIndex < composerIndex, true);
  assert.equal(previewIndex < composerIndex, true);
  assert.equal(/^\s*CN-RESUME\s*$/m.test(frame), false);

  tui.dispose();
});
