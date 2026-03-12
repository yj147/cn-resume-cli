import test from "node:test";
import assert from "node:assert/strict";

const patchesModule = await import("../dist/core/patches.js");

test("createModulePatch captures module diff metadata", () => {
  const createdAt = "2026-03-12T10:00:00.000Z";
  const patch = patchesModule.createModulePatch({
    module: patchesModule.RESUME_MODULES.BASIC,
    previousValue: { name: "旧值" },
    nextValue: { name: "新值" },
    source: "parsed_exact",
    severity: patchesModule.PATCH_SEVERITIES.WARNING,
    rollback: {
      strategy: "replace",
      target: "currentResume.model.basic"
    },
    createdAt
  });

  assert.equal(patch.module, patchesModule.RESUME_MODULES.BASIC);
  assert.equal(patch.source, "parsed_exact");
  assert.equal(patch.severity, patchesModule.PATCH_SEVERITIES.WARNING);
  assert.deepEqual(patch.rollback, {
    strategy: "replace",
    target: "currentResume.model.basic"
  });
  assert.equal(patch.createdAt, createdAt);
});

test("createResumeDraft groups module patches under one draft contract", () => {
  const createdAt = "2026-03-12T10:05:00.000Z";
  const draft = patchesModule.createResumeDraft({
    source: "parse-resume",
    summary: "解析结果待确认",
    patches: [
      patchesModule.createModulePatch({
        module: patchesModule.RESUME_MODULES.BASIC,
        previousValue: null,
        nextValue: { name: "杨进" },
        source: "parsed_exact",
        rollback: {
          strategy: "replace",
          target: "currentResume.model.basic"
        },
        createdAt
      })
    ],
    createdAt
  });

  assert.equal(draft.source, "parse-resume");
  assert.equal(draft.summary, "解析结果待确认");
  assert.equal(draft.patches.length, 1);
  assert.equal(draft.patches[0].module, patchesModule.RESUME_MODULES.BASIC);
  assert.equal(draft.createdAt, createdAt);
});
