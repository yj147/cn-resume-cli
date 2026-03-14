import test from "node:test";
import assert from "node:assert/strict";

test("dist render-engine entrypoints are importable", async () => {
  const adapter = await import("../dist/render-engine/adapter.js");
  const builders = await import("../dist/render-engine/builders.js");
  const constants = await import("../dist/render-engine/constants.js");
  const pdf = await import("../dist/render-engine/generate-pdf.js");
  const qrcode = await import("../dist/render-engine/qrcode.js");
  const types = await import("../dist/render-engine/types.js");
  const utils = await import("../dist/render-engine/utils.js");

  assert.equal(typeof adapter.modelToDocumentIR, "function");
  assert.equal(typeof adapter.modelToThemeConfig, "function");
  assert.equal(typeof adapter.modelToRenderResume, "function");
  assert.equal(typeof builders.generateHtml, "function");
  assert.equal(typeof pdf.generatePdf, "function");
  assert.equal(typeof pdf.renderHtmlScreenshot, "function");
  assert.equal(typeof qrcode.generateQrSvg, "function");
  assert.equal(typeof qrcode.extractUrlsFromResume, "function");
  assert.equal(typeof constants, "object");
  assert.equal(typeof types, "object");
  assert.equal(typeof utils, "object");
});
