import test from "node:test";
import assert from "node:assert/strict";

const argsModule = await import("../dist/cli/args.js");

test("usage output avoids JadeAI branding", () => {
  const text = argsModule.usage();
  assert.doesNotMatch(text, /JadeAI/);
  assert.match(text, /template list/);
});

