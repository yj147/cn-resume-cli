import test from "node:test";
import assert from "node:assert/strict";

const brandModule = await import("../dist/tui/brand.js");
const themeModule = await import("../dist/tui/theme.js");

test("theme exposes the approved stitch-aligned token groups", () => {
  assert.equal(themeModule.TUI_THEME.frame.background, "#0d1117");
  assert.equal(themeModule.TUI_THEME.frame.surface, "#161b22");
  assert.equal(themeModule.TUI_THEME.frame.border, "#30363d");
  assert.equal(themeModule.TUI_THEME.assistant.header, "● cn-resume");
  assert.equal(themeModule.TUI_THEME.assistant.accent, "#d2a8ff");
  assert.equal(themeModule.TUI_THEME.user.accent, "#79c0ff");
  assert.equal(themeModule.TUI_THEME.tool.diff.add, "#7ee787");
  assert.equal(themeModule.TUI_THEME.tool.diff.remove, "#ff7b72");
  assert.equal(themeModule.TUI_THEME.tool.diff.meta, "#8b949e");
  assert.equal(themeModule.TUI_THEME.input.cursor, "#79c0ff");
});

test("renderBrandSplash reads the approved splash file and returns multi-line output", () => {
  const splash = brandModule.renderBrandSplash();
  assert.equal(typeof splash, "string");
  assert.equal(splash.length > 0, true);
  assert.equal(splash.includes("▓▓"), true);
  assert.equal(splash.split("\n").length > 1, true);
});
