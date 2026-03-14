#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="$(mktemp -d /tmp/cn-resume-parse-regression.XXXXXX)"
PARSER_FIXTURES_DIR="fixtures/parser"

parse_fixture() {
  local name="$1"
  node bin/cn-resume.js parse \
    --input "$PARSER_FIXTURES_DIR/${name}.txt" \
    --output "$OUT_DIR/${name}.json"
}

parse_fixture "education-split"
parse_fixture "skill-grouping"
parse_fixture "project-exp-dedupe"
parse_fixture "contact-contamination"

node bin/cn-resume.js optimize \
  --input "fixtures/sample-resume-contract.json" \
  --jd "fixtures/sample-jd.txt" \
  --feedback "请补齐高并发与Redis相关成果" \
  --confirm \
  --output "$OUT_DIR/optimize-a.json"

node bin/cn-resume.js optimize \
  --input "fixtures/sample-resume-contract.json" \
  --jd "fixtures/sample-jd.txt" \
  --feedback "请补齐高并发与Redis相关成果" \
  --confirm \
  --output "$OUT_DIR/optimize-b.json"

node --input-type=module - "$OUT_DIR" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];

function load(name) {
  const file = path.join(outDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[parse-regression] FAIL: ${message}`);
    process.exit(1);
  }
}

function fieldValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    return String(value.value || "");
  }
  return String(value || "");
}

function assertParseEvidence(model, name) {
  const evidence = model?.meta?.parse_evidence;
  assert(evidence && typeof evidence === "object", `${name} should include meta.parse_evidence`);
  assert(
    evidence.paradigm === "render-engine-section-first",
    `${name} parse_evidence.paradigm should be render-engine-section-first`
  );
  assert(Number.isFinite(Number(evidence.overall_confidence)), `${name} parse_evidence.overall_confidence should be numeric`);
  assert(Number(evidence.overall_confidence) >= 0 && Number(evidence.overall_confidence) <= 1, `${name} overall_confidence out of range`);
  assert(Array.isArray(evidence.sections) && evidence.sections.length > 0, `${name} parse_evidence.sections should be non-empty array`);
}

const education = load("education-split");
assertParseEvidence(education, "education-split");
assert(Array.isArray(education.education), "education-split.education should be array");
assert(education.education.length === 2, `education-split should have 2 education records, got ${education.education.length}`);
for (const [idx, record] of education.education.entries()) {
  assert(
    /^(19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?$/.test(fieldValue(record.start_date)),
    `education-split record ${idx + 1} start_date invalid: ${fieldValue(record.start_date)}`
  );
  assert(
    /^(19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?$/.test(fieldValue(record.end_date)),
    `education-split record ${idx + 1} end_date invalid: ${fieldValue(record.end_date)}`
  );
}

const skills = load("skill-grouping");
assertParseEvidence(skills, "skill-grouping");
const skillMap = new Map(
  (skills.skills || []).map((group) => [
    String(group.category || "").trim(),
    new Set((group.items || []).map((item) => String(item?.name || item || "").trim()).filter(Boolean))
  ])
);
const expectSkillGroup = (category, expectedItems) => {
  assert(skillMap.has(category), `skill-grouping missing category '${category}'`);
  const set = skillMap.get(category);
  for (const item of expectedItems) {
    assert(set.has(item), `skill-grouping category '${category}' missing '${item}'`);
  }
};
expectSkillGroup("后端", ["Go", "Node.js", "微服务"]);
expectSkillGroup("数据库", ["MySQL", "PostgreSQL"]);
expectSkillGroup("中间件", ["Redis", "Kafka"]);

const dedupe = load("project-exp-dedupe");
assertParseEvidence(dedupe, "project-exp-dedupe");
assert((dedupe.projects || []).length === 1, `project-exp-dedupe should keep 1 project, got ${(dedupe.projects || []).length}`);
assert((dedupe.experience || []).length === 0, `project-exp-dedupe should dedupe experience to 0, got ${(dedupe.experience || []).length}`);

const contamination = load("contact-contamination");
assertParseEvidence(contamination, "contact-contamination");
const collected = [];
for (const exp of contamination.experience || []) {
  collected.push(...((exp.bullets || []).map((item) => String(item?.text || item?.description || item || ""))));
}
for (const proj of contamination.projects || []) {
  collected.push(...((proj.bullets || []).map((item) => String(item?.text || item?.description || item || ""))));
}
for (const edu of contamination.education || []) {
  collected.push(fieldValue(edu.major));
}
for (const skillGroup of contamination.skills || []) {
  collected.push(...((skillGroup.items || []).map((item) => String(item?.name || item || ""))));
}
const joined = collected.filter(Boolean).join("\n");
const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(joined);
const hasPhone = /(?:\+?86[-\s]?)?1[3-9]\d{9}/.test(joined);
const hasUrl = /(?:https?:\/\/|www\.)/i.test(joined);
assert(!hasEmail, "contact-contamination should not keep email in extracted bullets/skills/education");
assert(!hasPhone, "contact-contamination should not keep phone in extracted bullets/skills/education");
assert(!hasUrl, "contact-contamination should not keep URL in extracted bullets/skills/education");

const optimizeA = load("optimize-a");
const optimizeB = load("optimize-b");
const extractBullets = (model) => {
  const exp = (model.experience || []).map((item) => item.bullets || []);
  const proj = (model.projects || []).map((item) => item.bullets || []);
  return JSON.stringify({ exp, proj });
};
assert(
  extractBullets(optimizeA) === extractBullets(optimizeB),
  "optimize should be deterministic for same input/jd/feedback"
);

console.log("[parse-regression] PASS");
NODE
