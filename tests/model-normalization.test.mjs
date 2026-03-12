import test from "node:test";
import assert from "node:assert/strict";

const modelModule = await import("../dist/core/model.js");
const provenanceModule = await import("../dist/core/provenance.js");

test("createFieldEnvelope keeps empty fields empty with stable provenance metadata", () => {
  const updatedAt = "2026-03-12T00:00:00.000Z";
  const field = provenanceModule.createFieldEnvelope({ updatedAt });

  assert.deepEqual(field, {
    value: "",
    source: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    confidence: 0,
    status: provenanceModule.FIELD_STATUSES.EMPTY,
    updatedBy: provenanceModule.FIELD_SOURCES.USER_EXPLICIT,
    updatedAt
  });
});

test("buildEmptyField in model uses provenance defaults for parsed candidate values", () => {
  const updatedAt = "2026-03-12T01:23:45.000Z";
  const field = modelModule.buildEmptyField({
    value: "张三",
    source: provenanceModule.FIELD_SOURCES.PARSED_EXACT,
    confidence: 0.92,
    updatedAt
  });

  assert.equal(field.value, "张三");
  assert.equal(field.source, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(field.confidence, 0.92);
  assert.equal(field.status, provenanceModule.FIELD_STATUSES.SUGGESTED);
  assert.equal(field.updatedBy, provenanceModule.FIELD_SOURCES.PARSED_EXACT);
  assert.equal(field.updatedAt, updatedAt);
});

test("upgradeFieldStatus only moves forward to a stronger confirmed state", () => {
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.EMPTY,
      provenanceModule.FIELD_STATUSES.SUGGESTED
    ),
    provenanceModule.FIELD_STATUSES.SUGGESTED
  );
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.SUGGESTED,
      provenanceModule.FIELD_STATUSES.CONFIRMED
    ),
    provenanceModule.FIELD_STATUSES.CONFIRMED
  );
  assert.equal(
    provenanceModule.upgradeFieldStatus(
      provenanceModule.FIELD_STATUSES.CONFIRMED,
      provenanceModule.FIELD_STATUSES.SUGGESTED
    ),
    provenanceModule.FIELD_STATUSES.CONFIRMED
  );
});
