import test from "node:test";
import assert from "node:assert/strict";

const constantsModule = await import("../dist/constants.js");

test("render-engine builder registry matches public 16-template catalog", async () => {
  assert.equal(constantsModule.TEMPLATE_LIST.includes("single-clean"), true);

  const buildersModule = await import("../dist/render-engine/builders.js");
  const registry = buildersModule.TEMPLATE_BUILDERS;
  assert.equal(typeof registry, "object");

  const keys = Object.keys(registry).sort();
  const expected = [...constantsModule.TEMPLATE_LIST].sort();
  assert.deepEqual(keys, expected);
  assert.equal(keys.includes("single-clean"), true);
});

