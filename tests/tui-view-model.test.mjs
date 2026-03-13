import test from "node:test";
import assert from "node:assert/strict";

const viewModelModule = await import("../dist/tui/view-model.js");

function createSession(overrides = {}) {
  return {
    workflowState: "drafting",
    transcript: [],
    artifacts: {},
    pendingPatches: [],
    phaseB: null,
    ...overrides
  };
}

test("view model derives LIVE DRAFT, COMMITTED, and EXPORT PREVIEW without mutating session truth", () => {
  const liveDraftSession = createSession({
    pendingPatches: [{ patchId: "patch-basic" }],
    phaseB: { status: "awaiting_feedback" }
  });
  const committedSession = createSession({
    workflowState: "confirmed_content"
  });
  const exportPreviewSession = createSession({
    workflowState: "ready_to_export",
    artifacts: {
      templateComparison: {
        previews: [{ templateId: "designer" }]
      }
    }
  });

  const before = JSON.stringify(liveDraftSession);
  const liveDraft = viewModelModule.buildTuiViewModel(liveDraftSession);
  const committed = viewModelModule.buildTuiViewModel(committedSession);
  const exportPreview = viewModelModule.buildTuiViewModel(exportPreviewSession);

  assert.equal(liveDraft.preview.visible, true);
  assert.equal(liveDraft.preview.statusLabel, "LIVE DRAFT");
  assert.equal(committed.preview.visible, false);
  assert.equal(committed.preview.statusLabel, "COMMITTED");
  assert.equal(exportPreview.preview.visible, true);
  assert.equal(exportPreview.preview.statusLabel, "EXPORT PREVIEW");
  assert.equal(liveDraft.preview.tab, "Structure");
  assert.equal(JSON.stringify(liveDraftSession), before);
});

test("view model projects assistant user and tool transcript items with condensed diff output", () => {
  const diffPreview = Array.from({ length: 13 }, (_, index) => ({
    kind: index % 3 === 0 ? "meta" : index % 2 === 0 ? "remove" : "add",
    text: `line-${index + 1}`
  }));

  const session = createSession({
    transcript: [
      { type: "user_message", content: "优化当前简历" },
      { type: "assistant_completed", content: "好的，先给出计划。" },
      {
        type: "task_finished",
        taskType: "optimize-resume",
        summary: "优化结果待确认",
        status: "done",
        defaultExpanded: true,
        hideDiagnostics: true,
        diffPreview
      }
    ]
  });

  const model = viewModelModule.buildTuiViewModel(session);

  assert.deepEqual(
    model.transcript.map((item) => item.kind),
    ["user", "assistant", "tool"]
  );
  assert.equal(model.transcript[1].header, "● cn-resume");
  assert.equal(model.transcript[2].defaultExpanded, true);
  assert.equal(model.transcript[2].hideDiagnostics, true);
  assert.equal(model.transcript[2].diff.condensed, true);
  assert.equal(model.transcript[2].diff.hiddenCount, 7);
  assert.equal(model.transcript[2].diff.lines.length, 7);
  assert.equal(model.transcript[2].diff.lines[4].text, "… 7 lines hidden");
});
