import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";

const laneModule = await import("../dist/tui/transcript/lane.js");
const viewModelModule = await import("../dist/tui/view-model.js");

function createSession() {
  return {
    workflowState: "drafting",
    pendingPatches: [{ patchId: "patch-basic" }],
    phaseB: null,
    artifacts: {},
    transcript: [
      { type: "assistant_completed", content: "已分析当前简历。" },
      { type: "user_message", content: "优化当前简历" },
      {
        type: "task_finished",
        taskType: "optimize-resume",
        summary: "优化结果待确认",
        status: "done",
        defaultExpanded: true,
        hideDiagnostics: true,
        diffPreview: [
          { kind: "meta", text: "basic · parsed_exact" },
          { kind: "remove", text: "basic: 旧名字" },
          { kind: "add", text: "basic: 新名字" }
        ]
      }
    ]
  };
}

test("transcript lane renders assistant, user, and tool cards without diagnostics noise", () => {
  const model = viewModelModule.buildTuiViewModel(createSession());
  const app = render(React.createElement(laneModule.TranscriptLane, { items: model.transcript }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /● cn-resume/);
  assert.match(frame, /❯ User/);
  assert.match(frame, /\+ basic: 新名字/);
  assert.match(frame, /- basic: 旧名字/);
  assert.equal(/\[(WARN|INFO)\]/.test(frame), false);

  app.unmount();
});

test("transcript lane drops warn and info logs from the main axis", () => {
  const model = viewModelModule.buildTuiViewModel({
    workflowState: "drafting",
    pendingPatches: [],
    phaseB: null,
    artifacts: {},
    transcript: [
      { type: "log", level: "warn", content: "Resume length is currently 1.2 pages." },
      { type: "log", level: "info", content: "Syncing local data with cloud store... Done." }
    ]
  });
  const app = render(React.createElement(laneModule.TranscriptLane, { items: model.transcript }));
  const frame = app.lastFrame() || "";

  assert.equal(frame.includes("[WARN]"), false);
  assert.equal(frame.includes("[INFO]"), false);
  assert.equal(frame.includes("Resume length is currently 1.2 pages."), false);
  assert.equal(frame.includes("Syncing local data with cloud store... Done."), false);

  app.unmount();
});

test("transcript lane renders approval cards inline instead of plain slash instructions", () => {
  const model = viewModelModule.buildTuiViewModel({
    workflowState: "drafting",
    pendingPatches: [],
    phaseB: null,
    artifacts: {},
    transcript: [
      {
        type: "approval_requested",
        title: "优化当前简历",
        summary: "优化当前简历",
        confirmLabel: "Enter 确认",
        rejectLabel: "Esc 取消"
      }
    ]
  });
  const app = render(React.createElement(laneModule.TranscriptLane, { items: model.transcript }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /优化当前简历/);
  assert.match(frame, /Enter 确认/);
  assert.match(frame, /Esc 取消/);
  assert.equal(frame.includes("/go"), false);
  assert.equal(frame.includes("/cancel"), false);

  app.unmount();
});

test("transcript lane keeps the recent 100 items stable", () => {
  const items = Array.from({ length: 120 }, (_, index) => ({
    id: `item-${index}`,
    kind: index % 2 === 0 ? "status" : "result",
    content: `line-${index}`
  }));

  const app = render(React.createElement(laneModule.TranscriptLane, { items }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /line-119/);
  assert.equal(frame.includes("line-0"), false);

  app.unmount();
});
