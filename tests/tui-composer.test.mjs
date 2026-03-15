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

  assert.match(frame, /优化技能描述▉/);
  app.unmount();
});

test("composer hides shortcut hints once the user starts typing", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "优化技能描述",
    focused: true,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /优化技能描述▉/);
  assert.equal(frame.includes("TAB Auto-complete"), false);
  assert.equal(frame.includes("ESC Cancel"), false);
  assert.equal(frame.includes("ENTER Run"), false);
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
  assert.match(frame, /第二行▉/);
  app.unmount();
});

test("composer hides cursor when not focused", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "优化摘要",
    focused: false,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.equal(frame.includes("▉"), false);
  app.unmount();
});

test("composer renders the approved hint copy", () => {
  const app = render(React.createElement(composerModule.Composer, {
    draftText: "",
    focused: true,
    cursorVisible: true
  }));
  const frame = app.lastFrame() || "";

  assert.match(frame, /TAB Auto-complete/);
  assert.match(frame, /ESC Cancel/);
  assert.match(frame, /ENTER Run/);
  app.unmount();
});
