import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const commandsModule = await import("../dist/commands.js");
const pdfModule = await import("../dist/pdf.js");
const screenshotModule = await import("../dist/render-engine/generate-pdf.js");

async function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-visual-e2e-"));
  try {
    return await run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function pngDimensions(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function assertPng(buffer) {
  assert.equal(buffer.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
  const { width, height } = pngDimensions(buffer);
  assert.equal(width > 100, true);
  assert.equal(height > 100, true);
}

test("visual regression renders HTML screenshot and PDF first-page PNG for custom resume", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "input.json");
    const optimizedPath = path.join(tempDir, "optimized.json");
    const preparedPath = path.join(tempDir, "prepared.json");
    const htmlPath = path.join(tempDir, "resume.html");
    const pdfPath = path.join(tempDir, "resume.pdf");

    const model = JSON.parse(fs.readFileSync(path.resolve("fixtures/sample-resume.json"), "utf8"));
    model.basic.summary = "这是一份用于 PDF/视觉截图回归的自定义内容简历。";
    model.custom_sections = [
      ...(model.custom_sections || []),
      {
        title: "视觉回归说明",
        content: "验证 HTML 截图与 PDF 首屏渲染均可稳定生成。"
      }
    ];
    fs.writeFileSync(inputPath, JSON.stringify(model, null, 2), "utf8");

    await commandsModule.runOptimize({
      input: inputPath,
      jd: path.resolve("fixtures/sample-jd.txt"),
      feedback: "确认导出",
      confirm: true,
      output: optimizedPath
    });

    await commandsModule.runPrepareExport({
      input: optimizedPath,
      jd: path.resolve("fixtures/sample-jd.txt"),
      template: "elegant",
      "accept-multipage": true,
      engine: "rule",
      output: preparedPath
    });

    await commandsModule.runGenerate({
      input: preparedPath,
      output: htmlPath
    });
    await commandsModule.runGenerate({
      input: preparedPath,
      output: pdfPath
    });

    const html = fs.readFileSync(htmlPath, "utf8");
    const screenshot = await screenshotModule.renderHtmlScreenshot(html);
    const pdfPngs = await pdfModule.renderPdfPagesToPngBuffers(pdfPath, 1);

    assertPng(screenshot);
    assert.equal(pdfPngs.length, 1);
    assertPng(pdfPngs[0]);
    assert.equal(fs.statSync(pdfPath).size > 0, true);
  });
});
