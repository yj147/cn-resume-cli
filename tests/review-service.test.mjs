import test from "node:test";
import assert from "node:assert/strict";

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
