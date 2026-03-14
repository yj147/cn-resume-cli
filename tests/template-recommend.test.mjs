import test from "node:test";
import assert from "node:assert/strict";

const customTemplateModule = await import("../dist/template/custom-template.js");
const recommendModule = await import("../dist/template/recommend.js");

function buildBaseModel() {
  const model = customTemplateModule.createTemplatePreviewSample();
  model.render_config = {
    template: "single-clean",
    pages: 1
  };
  return model;
}

test("template recommendation returns three candidates with reasons and risks by default", () => {
  const result = recommendModule.recommendTemplates({
    model: buildBaseModel()
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.signals.pageGoal, 1);
  assert.equal(typeof result.signals.targetRole, "string");
  assert.equal(["low", "medium", "high"].includes(result.signals.contentDensity.level), true);

  for (const candidate of result.candidates) {
    assert.equal(typeof candidate.templateId, "string");
    assert.equal(typeof candidate.score, "number");
    assert.equal(Array.isArray(candidate.reasons), true);
    assert.equal(candidate.reasons.length > 0, true);
    assert.equal(Array.isArray(candidate.risks), true);
    assert.equal(candidate.risks.length > 0, true);
  }
});

test("template recommendation reads review overflow and ats preference to prioritize compact ats-safe templates", () => {
  const denseModel = buildBaseModel();
  denseModel.experience[0].bullets = Array.from({ length: 9 }, (_, index) => `负责复杂平台改造并协调多个系统落地 ${index + 1}`);
  denseModel.projects.push({
    name: denseModel.projects[0].name,
    bullets: Array.from({ length: 6 }, (_, index) => `交付关键项目里程碑 ${index + 1}`)
  });

  const result = recommendModule.recommendTemplates({
    model: denseModel,
    reviewResult: {
      findings: [
        {
          category: "layout_quality",
          severity: "warning",
          message: "当前内容密度较高，排版存在超页风险。"
        }
      ]
    },
    preferences: {
      pageGoal: 1,
      atsPreferred: true
    }
  });

  assert.equal(result.signals.overflowRisk, true);
  assert.equal(result.signals.atsPreferred, true);
  assert.equal(result.signals.contentDensity.level, "high");
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.templateId),
    ["compact-ats", "single-ats", "compact-clean"]
  );
  assert.equal(result.candidates[0].reasons.some((reason) => /超页|ATS|一页/.test(reason)), true);
});

test("template recommendation uses target role and preference keywords without fabricating absent signals", () => {
  const model = buildBaseModel();
  model.basic.title.value = "资深 UI 设计师";

  const result = recommendModule.recommendTemplates({
    model,
    preferences: {
      targetRole: "UI 设计师",
      preferenceKeywords: ["创意", "视觉", "作品集"],
      pageGoal: 2
    }
  });

  assert.equal(result.signals.targetRole, "UI 设计师");
  assert.deepEqual(result.signals.preferenceKeywords, ["创意", "视觉", "作品集"]);
  assert.equal(result.signals.atsPreferred, false);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.templateId),
    ["editorial-accent", "timeline-accent", "single-accent"]
  );
  assert.equal(result.candidates[0].reasons.some((reason) => /设计|视觉|创意/.test(reason)), true);
  assert.equal(result.signals.pageGoal, 2);
});
