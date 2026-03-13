import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";

const drawerModule = await import("../dist/tui/drawer/preview-drawer.js");
const uiStateModule = await import("../dist/tui/ui-state.js");
const viewModelModule = await import("../dist/tui/view-model.js");

function createSession(overrides = {}) {
  return {
    workflowState: "confirmed_content",
    pendingPatches: [],
    phaseB: { status: "confirmed" },
    artifacts: {},
    transcript: [],
    ...overrides
  };
}

test("preview drawer stays closed by default when edit loop is inactive", () => {
  const session = createSession();
  const viewModel = viewModelModule.buildTuiViewModel(session);
  const app = render(React.createElement(drawerModule.PreviewDrawer, {
    viewModel,
    session,
    uiState: uiStateModule.createUiState()
  }));

  assert.equal(viewModel.preview.visible, false);
  assert.equal(app.lastFrame() || "", "");
  app.unmount();
});

test("preview drawer auto-opens for resumeDraft, pendingPatches, and awaiting phaseB", () => {
  const sessions = [
    createSession({ resumeDraft: { draftId: "draft-1" } }),
    createSession({ pendingPatches: [{ patchId: "patch-1" }] }),
    createSession({ phaseB: { status: "awaiting_feedback" } })
  ];

  for (const session of sessions) {
    const viewModel = viewModelModule.buildTuiViewModel(session);
    const app = render(React.createElement(drawerModule.PreviewDrawer, {
      viewModel,
      session,
      uiState: uiStateModule.createUiState()
    }));
    const frame = app.lastFrame() || "";

    assert.equal(viewModel.preview.visible, true);
    assert.equal(viewModel.preview.lockedByEditLoop, true);
    assert.match(frame, /LIVE DRAFT · Structure/);
    app.unmount();
  }
});

test("preview drawer releases edit lock when pending patches are cleared and phaseB is no longer awaiting", () => {
  const session = createSession({
    pendingPatches: [],
    phaseB: { status: "confirmed" }
  });
  const viewModel = viewModelModule.buildTuiViewModel(session);

  assert.equal(viewModel.preview.visible, false);
  assert.equal(viewModel.preview.lockedByEditLoop, false);
});

test("preview drawer can render committed and export preview states through ui-only preference", () => {
  const committedSession = createSession();
  const committedViewModel = viewModelModule.buildTuiViewModel(committedSession);
  const committedUiState = uiStateModule.createUiState();
  committedUiState.manualPreviewPreference = "open";
  let app = render(React.createElement(drawerModule.PreviewDrawer, {
    viewModel: committedViewModel,
    session: committedSession,
    uiState: committedUiState
  }));
  assert.match(app.lastFrame() || "", /COMMITTED · Structure/);
  app.unmount();

  const exportSession = createSession({
    artifacts: {
      templateComparison: {
        previews: [{ templateId: "designer" }]
      }
    }
  });
  const exportViewModel = viewModelModule.buildTuiViewModel(exportSession);
  app = render(React.createElement(drawerModule.PreviewDrawer, {
    viewModel: exportViewModel,
    session: exportSession,
    uiState: uiStateModule.createUiState()
  }));
  assert.match(app.lastFrame() || "", /EXPORT PREVIEW · Structure/);
  app.unmount();
});

test("ui state only stores ui-only transient fields", () => {
  const uiState = uiStateModule.createUiState();

  assert.equal(uiState.activePreviewTab, "Structure");
  assert.equal("isEditing" in uiState, false);
  assert.equal("workflowState" in uiState, false);
  assert.equal("previewLockedByEditLoop" in uiState, false);
});
