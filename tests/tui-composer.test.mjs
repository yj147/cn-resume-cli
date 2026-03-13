import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";

const composerModule = await import("../dist/tui/composer/composer.js");

test("composer renders single-line input with blinking cursor when focused", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "优化技能描述",
    focused: true,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /优化技能描述│/);
  app.unmount();
});

test("composer preserves multi-line draft text", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "第一行\n第二行",
    focused: true,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /第一行/);
  assert.match(frame, /第二行│/);
  app.unmount();
});

test("composer hides cursor when not focused", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "优化摘要",
    focused: false,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.equal(frame.includes("│"), false);
  app.unmount();
});

test("composer renders the approved hint copy", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "",
    focused: true,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /Enter send/);
  assert.match(frame, /Ctrl\+J newline/);
  assert.match(frame, /Tab complete/);
  assert.match(frame, /Esc close overlay/);
  app.unmount();
});
