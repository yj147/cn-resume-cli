import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const commandsModule = await import("../dist/commands.js");
const modelModule = await import("../dist/core/model.js");
const customTemplateModule = await import("../dist/template/custom-template.js");

async function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-custom-e2e-"));
  try {
    return await run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("custom content resume e2e produces txt/html/docx artifacts and shared thumbnail output", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "custom-input.json");
    const optimizedPath = path.join(tempDir, "optimized.json");
    const exportReadyPath = path.join(tempDir, "export-ready.json");
    const txtPath = path.join(tempDir, "custom-resume.txt");
    const htmlPath = path.join(tempDir, "custom-resume.html");
    const docxPath = path.join(tempDir, "custom-resume.docx");
    const jdFixture = path.resolve("fixtures/sample-jd.txt");

    const inputModel = readJson(path.resolve("fixtures/sample-resume.json"));
    inputModel.custom_sections = [
      ...(inputModel.custom_sections || []),
      {
        title: "定制内容",
        content: "支持面向金融风控与多租户SaaS的定制化交付。"
      }
    ];
    inputModel.basic.summary = "聚焦复杂业务场景下的定制化简历交付。";
    fs.writeFileSync(inputPath, JSON.stringify(inputModel, null, 2), "utf8");

    await commandsModule.runOptimize({
      input: inputPath,
      jd: jdFixture,
      feedback: "确认保留所有自定义内容并生成可导出版本",
      confirm: true,
      output: optimizedPath
    });

    await commandsModule.runPrepareExport({
      input: optimizedPath,
      jd: jdFixture,
      template: "elegant",
      "accept-multipage": true,
      engine: "rule",
      output: exportReadyPath
    });

    const exportReady = readJson(exportReadyPath);
    assert.equal(exportReady.meta.template, "elegant");
    assert.equal(exportReady.meta.templateConfirmed, true);
    assert.equal(exportReady.render_config.templateConfirmed, true);
    assert.equal(exportReady.meta.reviewResult.summary.blocked, false);
    assert.equal(exportReady.meta.layoutResult.templateId, "elegant");
    assert.equal(exportReady.meta.layoutResult.stable, true);

    await commandsModule.runGenerate({
      input: exportReadyPath,
      output: txtPath
    });
    await commandsModule.runGenerate({
      input: exportReadyPath,
      output: htmlPath
    });
    await commandsModule.runGenerate({
      input: exportReadyPath,
      output: docxPath
    });

    const txt = fs.readFileSync(txtPath, "utf8");
    const html = fs.readFileSync(htmlPath, "utf8");
    assert.match(txt, /支持面向金融风控与多租户SaaS的定制化交付。/);
    assert.match(html, /支持面向金融风控与多租户SaaS的定制化交付。/);
    assert.equal(fs.statSync(docxPath).size > 0, true);

    const normalized = modelModule.normalizeReactiveJson(readJson(exportReadyPath));
    const thumbnail = await customTemplateModule.renderTemplateThumbnail(normalized, "elegant");
    assert.equal(thumbnail.template, "elegant");
    assert.match(thumbnail.html, /支持面向金融风控与多租户SaaS的定制化交付。|聚焦复杂业务场景下的定制化简历交付。/);
  });
});
