import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const constantsModule = await import("../dist/constants.js");
const customTemplateModule = await import("../dist/template/custom-template.js");
const specModule = await import("../dist/template/spec.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("template spec registry resolves every builtin template with required fields", () => {
  assert.equal(constantsModule.TEMPLATE_LIST.length, 50);

  for (const name of constantsModule.TEMPLATE_LIST) {
    const spec = specModule.resolveTemplateSpec(name);
    assert.equal(spec.name, name);
    assert.equal(typeof spec.layoutFamily, "string");
    assert.equal(Array.isArray(spec.sectionRecipes.order), true);
    assert.equal(typeof spec.visualTokens.accent, "string");
    assert.equal(typeof spec.paginationPolicy.mode, "string");
  }
});

test("template spec rejects unsupported builtin names explicitly", () => {
  assert.throws(
    () => specModule.resolveTemplateSpec("not-a-template"),
    /Unsupported template/
  );
});

test("constants derive builtin template exports from template spec registry", () => {
  const constantsSource = readSource("../src/constants.ts");
  assert.match(constantsSource, /from "\.\/template\/spec\.js"/);
  assert.doesNotMatch(constantsSource, /export const TEMPLATE_LIST = \[\s*\n/);
});

test("resolveTemplate uses template spec for builtin and alias paths and keeps imported path in one protocol", () => {
  const builtin = customTemplateModule.resolveTemplate("elegant", {
    aliases: {},
    imports: {}
  });
  const alias = customTemplateModule.resolveTemplate("magic", {
    aliases: {},
    imports: {}
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-template-import-"));
  try {
    const importedFile = path.join(tempDir, "custom.html");
    fs.writeFileSync(importedFile, "<html><body>{{name}}</body></html>", "utf8");
    const imported = customTemplateModule.resolveTemplate("portfolio", {
      aliases: {},
      imports: {
        portfolio: importedFile
      }
    });

    assert.equal(builtin.spec.name, "elegant");
    assert.equal(alias.resolved, "modern");
    assert.equal(alias.spec.name, "modern");
    assert.equal(imported.kind, "imported");
    assert.equal(imported.spec, null);
    assert.equal(typeof imported.sourcePath, "string");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveTemplate blocks invalid imported template sources explicitly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-template-invalid-"));
  try {
    assert.throws(
      () =>
        customTemplateModule.resolveTemplate("broken", {
          aliases: {},
          imports: {
            broken: path.join(tempDir, "missing.html")
          }
        }),
      /Template file does not exist/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const customTemplateSource = readSource("../src/template/custom-template.ts");
  assert.match(customTemplateSource, /resolveTemplateSpec/);
  assert.doesNotMatch(customTemplateSource, /TEMPLATE_LIST\.includes/);
});
