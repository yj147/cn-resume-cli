import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const indexModule = await import("../dist/index.js");

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-entry-"));
  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createDeps(overrides = {}) {
  return {
    loadLocalEnvFile: () => {},
    usage: () => "USAGE",
    writeStdout: () => {},
    parseFlags: () => ({ positional: [], flags: {} }),
    runChatTui: async () => {
      throw new Error("runChatTui should be stubbed");
    },
    runParse: async () => {
      throw new Error("runParse should be stubbed");
    },
    runOptimize: async () => {
      throw new Error("runOptimize should not run");
    },
    runGenerate: async () => {
      throw new Error("runGenerate should not run");
    },
    runPrepareExport: async () => {
      throw new Error("runPrepareExport should not run");
    },
    runValidate: async () => {
      throw new Error("runValidate should not run");
    },
    runAnalyzeJd: async () => {
      throw new Error("runAnalyzeJd should not run");
    },
    runGrammarCheck: async () => {
      throw new Error("runGrammarCheck should not run");
    },
    runTemplateCommand: async () => {
      throw new Error("runTemplateCommand should not run");
    },
    ...overrides
  };
}

test("main routes empty argv to chat tui by dependency injection", async () => {
  let chatTuiCalls = 0;
  const writes = [];

  await indexModule.main([], createDeps({
    writeStdout: (text) => writes.push(text),
    runChatTui: async () => {
      chatTuiCalls += 1;
    }
  }));

  assert.equal(chatTuiCalls, 1);
  assert.deepEqual(writes, []);
});

test("main routes explicit chat subcommand to chat tui by dependency injection", async () => {
  let chatTuiCalls = 0;

  await indexModule.main(["chat"], createDeps({
    runChatTui: async () => {
      chatTuiCalls += 1;
    }
  }));

  assert.equal(chatTuiCalls, 1);
});

test("main keeps parse subcommand on CLI route", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "resume.txt");
    const outputPath = path.join(tempDir, "resume.json");
    fs.writeFileSync(inputPath, "张三\nzhangsan@example.com\n13800000000\n", "utf8");

    let receivedFlags = null;

    await indexModule.main(
      ["parse", "--input", inputPath, "--output", outputPath],
      createDeps({
        parseFlags: (args) => {
          assert.deepEqual(args, ["--input", inputPath, "--output", outputPath]);
          return {
            positional: [],
            flags: {
              input: inputPath,
              output: outputPath
            }
          };
        },
        runParse: async (flags) => {
          receivedFlags = flags;
        }
      })
    );

    assert.deepEqual(receivedFlags, {
      input: inputPath,
      output: outputPath
    });
  });
});
