import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const commandsModule = await import("../dist/commands.js");
const evaluationModule = await import("../dist/eval/evaluation.js");
const reviewServiceModule = await import("../dist/eval/review-service.js");

function buildReviewModel() {
  const longWeakBullet = "负责协助优化很多系统并参与一些平台改造".repeat(90);
  return {
    basics: {
      name: "张三",
      email: "zhangsan@example.com",
      phone: "13800000000"
    },
    experience: [
      {
        company: "Acme",
        title: "后端工程师",
        bullets: [longWeakBullet]
      }
    ],
    projects: [
      {
        name: "内部平台",
        bullets: ["参与一些内部工具开发并负责协助联调"]
      }
    ],
    skills: ["Node.js", "TypeScript"],
    education: []
  };
}

async function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-review-service-"));
  try {
    return await run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeReviewFixture(tempDir) {
  const inputPath = path.join(tempDir, "resume.json");
  const jdPath = path.join(tempDir, "jd.txt");
  const payload = {
    ...buildReviewModel(),
    meta: {
      phase_b: {
        confirmed: true
      }
    },
    render_config: {
      template: "elegant"
    }
  };
  fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(jdPath, "Kubernetes Go 微服务 架构 性能 优化 数据库", "utf8");
  return { inputPath, jdPath };
}

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("runReviewService aggregates validate analyze-jd and grammar into unified severity buckets", async () => {
  const result = await reviewServiceModule.runReviewService({
    model: buildReviewModel(),
    jdText: "Kubernetes Go 微服务 架构 性能 优化 数据库",
    template: "elegant",
    options: evaluationModule.resolveEvalOptions({ engine: "rule" })
  });

  assert.equal(result.summary.blocked, true);
  assert.equal(result.summary.counts.blocker > 0, true);
  assert.equal(result.summary.counts.warning > 0, true);
  assert.equal(result.summary.counts.suggestion > 0, true);
  assert.equal(result.findings.some((item) => item.category === reviewServiceModule.REVIEW_CATEGORIES.FACT_CONSISTENCY), true);
  assert.equal(result.findings.some((item) => item.category === reviewServiceModule.REVIEW_CATEGORIES.CONTENT_QUALITY), true);
  assert.equal(result.findings.some((item) => item.category === reviewServiceModule.REVIEW_CATEGORIES.JD_MATCH), true);
  assert.equal(result.findings.some((item) => item.category === reviewServiceModule.REVIEW_CATEGORIES.LAYOUT_QUALITY), true);
  assert.equal(Boolean(result.reports.validate), true);
  assert.equal(Boolean(result.reports["analyze-jd"]), true);
  assert.equal(Boolean(result.reports["grammar-check"]), true);
});

test("runReviewService supports single-check mode without fabricating other reports", async () => {
  const result = await reviewServiceModule.runReviewService({
    model: buildReviewModel(),
    template: "elegant",
    options: evaluationModule.resolveEvalOptions({ engine: "rule" }),
    checks: [reviewServiceModule.REVIEW_TASKS.GRAMMAR_CHECK]
  });

  assert.equal(Boolean(result.reports["grammar-check"]), true);
  assert.equal(result.reports.validate, undefined);
  assert.equal(result.reports["analyze-jd"], undefined);
  assert.equal(result.findings.every((item) => item.category === reviewServiceModule.REVIEW_CATEGORIES.CONTENT_QUALITY), true);
});

test("commands route review entrypoints through unified review service", async () => {
  await withTempDir(async (tempDir) => {
    const { inputPath, jdPath } = writeReviewFixture(tempDir);
    const validateOutput = path.join(tempDir, "validate.json");
    const analyzeOutput = path.join(tempDir, "analyze.json");
    const grammarOutput = path.join(tempDir, "grammar.json");

    await commandsModule.runValidate({
      input: inputPath,
      jd: jdPath,
      template: "elegant",
      engine: "rule",
      output: validateOutput
    });
    await commandsModule.runAnalyzeJd({
      input: inputPath,
      jd: jdPath,
      engine: "rule",
      output: analyzeOutput
    });
    await commandsModule.runGrammarCheck({
      input: inputPath,
      engine: "rule",
      output: grammarOutput
    });

    const validateReport = JSON.parse(fs.readFileSync(validateOutput, "utf8"));
    const analyzeReport = JSON.parse(fs.readFileSync(analyzeOutput, "utf8"));
    const grammarReport = JSON.parse(fs.readFileSync(grammarOutput, "utf8"));

    assert.equal(typeof validateReport.average, "number");
    assert.equal(typeof validateReport.quality_gates.passed, "boolean");
    assert.equal(Array.isArray(analyzeReport.missingKeywords), true);
    assert.equal(typeof analyzeReport.summary, "string");
    assert.equal(Array.isArray(grammarReport.issues), true);
    assert.equal(typeof grammarReport.score, "number");
  });

  const commandSource = readSource("../src/commands.ts");
  assert.match(commandSource, /runReviewService/);
  assert.doesNotMatch(commandSource, /validateByRule|validateByAI|analyzeByRule|analyzeJdByAI|grammarByRule|grammarCheckByAI/);
});
