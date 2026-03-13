import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const commandsModule = await import("../dist/commands.js");

async function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-prepare-export-"));
  try {
    return await run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("prepare-export creates export-ready model for pure CLI generate flow without manual patching", async () => {
  await withTempDir(async (tempDir) => {
    const parsedPath = path.join(tempDir, "parsed.json");
    const optimizedPath = path.join(tempDir, "optimized.json");
    const preparedPath = path.join(tempDir, "export-ready.json");
    const outputPath = path.join(tempDir, "resume.html");

    await commandsModule.runParse({
      input: path.resolve("fixtures/sample-resume-contract.json"),
      output: parsedPath
    });

    await commandsModule.runOptimize({
      input: parsedPath,
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

    const prepared = readJson(preparedPath);
    assert.equal(prepared.meta.template, "elegant");
    assert.equal(prepared.meta.templateConfirmed, true);
    assert.equal(prepared.render_config.template, "elegant");
    assert.equal(prepared.render_config.templateConfirmed, true);
    assert.equal(prepared.meta.reviewResult.summary.blocked, false);
    assert.equal(prepared.meta.layoutResult.source, "paginateDocument");
    assert.equal(prepared.meta.layoutResult.status, "overflow");
    assert.equal(Array.isArray(prepared.meta.layoutResult.pages), true);
    assert.equal(Array.isArray(prepared.meta.layoutResult.decisions), true);
    assert.equal(prepared.meta.layoutResult.templateId, "elegant");
    assert.equal(prepared.meta.layoutResult.selectedOption, "accept_multipage");
    assert.equal(prepared.meta.layoutResult.confirmed, true);
    assert.equal(prepared.meta.layoutResult.stable, true);
    assert.equal(Object.hasOwn(prepared.meta.layoutResult, "requiresFollowUp"), false);

    await commandsModule.runGenerate({
      input: preparedPath,
      output: outputPath
    });

    assert.equal(fs.existsSync(outputPath), true);
    assert.match(fs.readFileSync(outputPath, "utf8"), /SaaS 运营平台|杨进/);
  });
});
