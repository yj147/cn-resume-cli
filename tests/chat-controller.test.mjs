import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const controllerModule = await import("../dist/chat/controller.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("controller exports required workflow states and core events", () => {
  assert.deepEqual(
    [
      controllerModule.CHAT_STATES.INTAKE,
      controllerModule.CHAT_STATES.DRAFTING,
      controllerModule.CHAT_STATES.PENDING_CONFIRMATION,
      controllerModule.CHAT_STATES.CONFIRMED_CONTENT,
      controllerModule.CHAT_STATES.REVIEWING,
      controllerModule.CHAT_STATES.LAYOUT_SOLVING,
      controllerModule.CHAT_STATES.READY_TO_EXPORT,
      controllerModule.CHAT_STATES.EXPORTED,
      controllerModule.CHAT_STATES.BLOCKED
    ],
    [
      "intake",
      "drafting",
      "pending_confirmation",
      "confirmed_content",
      "reviewing",
      "layout_solving",
      "ready_to_export",
      "exported",
      "blocked"
    ]
  );

  assert.deepEqual(
    [
      controllerModule.CONTROLLER_EVENTS.PATCH_GENERATED,
      controllerModule.CONTROLLER_EVENTS.PATCH_ACCEPTED,
      controllerModule.CONTROLLER_EVENTS.PATCH_REJECTED,
      controllerModule.CONTROLLER_EVENTS.REVIEW_FAILED,
      controllerModule.CONTROLLER_EVENTS.LAYOUT_OVERFLOW,
      controllerModule.CONTROLLER_EVENTS.EXPORT_REQUESTED
    ],
    [
      "PATCH_GENERATED",
      "PATCH_ACCEPTED",
      "PATCH_REJECTED",
      "REVIEW_FAILED",
      "LAYOUT_OVERFLOW",
      "EXPORT_REQUESTED"
    ]
  );
});

test("controller transition follows the primary happy path", () => {
  const steps = [
    [controllerModule.CHAT_STATES.INTAKE, controllerModule.CONTROLLER_EVENTS.USER_PROVIDED_INFO, controllerModule.CHAT_STATES.DRAFTING],
    [controllerModule.CHAT_STATES.DRAFTING, controllerModule.CONTROLLER_EVENTS.PATCH_GENERATED, controllerModule.CHAT_STATES.PENDING_CONFIRMATION],
    [controllerModule.CHAT_STATES.PENDING_CONFIRMATION, controllerModule.CONTROLLER_EVENTS.PATCH_ACCEPTED, controllerModule.CHAT_STATES.CONFIRMED_CONTENT],
    [controllerModule.CHAT_STATES.CONFIRMED_CONTENT, controllerModule.CONTROLLER_EVENTS.EXPORT_REQUESTED, controllerModule.CHAT_STATES.READY_TO_EXPORT],
    [controllerModule.CHAT_STATES.READY_TO_EXPORT, controllerModule.CONTROLLER_EVENTS.EXPORT_REQUESTED, controllerModule.CHAT_STATES.EXPORTED]
  ];

  for (const [currentState, event, expectedState] of steps) {
    assert.equal(
      controllerModule.transitionWorkflowState(currentState, event),
      expectedState
    );
  }
});

test("controller transition covers rejection and layout overflow branches", () => {
  assert.equal(
    controllerModule.transitionWorkflowState(
      controllerModule.CHAT_STATES.DRAFTING,
      controllerModule.CONTROLLER_EVENTS.USER_PROVIDED_INFO
    ),
    controllerModule.CHAT_STATES.DRAFTING
  );

  assert.equal(
    controllerModule.transitionWorkflowState(
      controllerModule.CHAT_STATES.PENDING_CONFIRMATION,
      controllerModule.CONTROLLER_EVENTS.PATCH_REJECTED
    ),
    controllerModule.CHAT_STATES.DRAFTING
  );

  assert.equal(
    controllerModule.transitionWorkflowState(
      controllerModule.CHAT_STATES.CONFIRMED_CONTENT,
      controllerModule.CONTROLLER_EVENTS.LAYOUT_OVERFLOW
    ),
    controllerModule.CHAT_STATES.LAYOUT_SOLVING
  );

  assert.equal(
    controllerModule.transitionWorkflowState(
      controllerModule.CHAT_STATES.LAYOUT_SOLVING,
      controllerModule.CONTROLLER_EVENTS.USER_APPROVED_MULTIPAGE
    ),
    controllerModule.CHAT_STATES.READY_TO_EXPORT
  );
});

test("controller transition rejects illegal transitions explicitly", () => {
  for (const [state, event] of [
    [controllerModule.CHAT_STATES.EXPORTED, controllerModule.CONTROLLER_EVENTS.PATCH_ACCEPTED],
    [controllerModule.CHAT_STATES.BLOCKED, controllerModule.CONTROLLER_EVENTS.EXPORT_REQUESTED]
  ]) {
    assert.throws(
      () => controllerModule.transitionWorkflowState(state, event),
      /BLOCKED: invalid controller transition/
    );
  }
});

test("chat direct call sites use controller constants instead of hardcoded state writes", () => {
  const agentSource = readSource("../src/chat/agent.ts");
  const runtimeSource = readSource("../src/chat/runtime.ts");
  const sessionSource = readSource("../src/chat/session.ts");

  assert.match(sessionSource, /CHAT_STATES\.WAITING_CONFIRM/);
  assert.match(sessionSource, /deriveSessionStatus/);
  assert.doesNotMatch(agentSource, /status:\s*"waiting_confirm"/);
  assert.match(runtimeSource, /CHAT_STATES/);
  assert.match(sessionSource, /CHAT_STATES\.IDLE/);
  assert.doesNotMatch(sessionSource, /status:\s*"idle"/);
});
