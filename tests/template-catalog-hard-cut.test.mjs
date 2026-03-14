import test from "node:test";
import assert from "node:assert/strict";

const specModule = await import("../dist/template/spec.js");
const customTemplateModule = await import("../dist/template/custom-template.js");

const LEGACY_TEMPLATE_NAMES = ["classic", "modern", "elegant"];

for (const name of LEGACY_TEMPLATE_NAMES) {
  test(`hard-cut rejects legacy template '${name}' in spec registry`, () => {
    assert.throws(() => specModule.resolveTemplateSpec(name), /template list/);
  });

  test(`hard-cut rejects legacy template '${name}' in resolveTemplate`, () => {
    assert.throws(
      () =>
        customTemplateModule.resolveTemplate(name, {
          aliases: {},
          imports: {}
        }),
      /template list/
    );
  });
}

