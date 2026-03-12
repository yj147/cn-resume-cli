import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const constantsModule = await import("../dist/constants.js");
const specModule = await import("../dist/template/spec.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("template spec registry resolves every builtin template with required fields", () => {
  assert.equal(constantsModule.TEMPLATE_LIST.length, 50);

  for (const name of constantsModule.TEMPLATE_LIST) {
    const spec = specModule.resolveTemplateSpec(name);
    assert.equal(spec.name, name);
    assert.equal(typeof spec.layoutFamily, "string");
    assert.equal(Array.isArray(spec.sectionRecipes.order), true);
    assert.equal(typeof spec.visualTokens.accent, "string");
    assert.equal(typeof spec.paginationPolicy.mode, "string");
  }
});

test("template spec rejects unsupported builtin names explicitly", () => {
  assert.throws(
    () => specModule.resolveTemplateSpec("not-a-template"),
    /Unsupported template/
  );
});

test("constants derive builtin template exports from template spec registry", () => {
  const constantsSource = readSource("../src/constants.ts");
  assert.match(constantsSource, /from "\.\/template\/spec\.js"/);
  assert.doesNotMatch(constantsSource, /export const TEMPLATE_LIST = \[\s*\n/);
});
