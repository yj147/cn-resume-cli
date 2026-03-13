import { pathToFileURL } from "node:url";
import { loadLocalEnvFile } from "./env.js";
import { parseFlags, usage } from "./cli/args.js";
import {
  runAnalyzeJd,
  runGenerate,
  runGrammarCheck,
  runOptimize,
  runPrepareExport,
  runParse,
  runTemplateCommand,
  runValidate
} from "./commands.js";
import { runChatTui } from "./tui/run.js";

const DEFAULT_MAIN_DEPS = {
  loadLocalEnvFile,
  parseFlags,
  usage,
  writeStdout: (text) => process.stdout.write(text),
  runChatTui,
  runAnalyzeJd,
  runGenerate,
  runGrammarCheck,
  runOptimize,
  runPrepareExport,
  runParse,
  runTemplateCommand,
  runValidate
};

export async function main(argv, deps = {}) {
  const resolvedDeps = {
    ...DEFAULT_MAIN_DEPS,
    ...deps
  };
  if (argv[0] === "--help" || argv[0] === "-h") {
    resolvedDeps.writeStdout(`${resolvedDeps.usage()}\n`);
    return;
  }

  resolvedDeps.loadLocalEnvFile();

  if (!argv.length) {
    await resolvedDeps.runChatTui({});
    return;
  }

  const [command, ...rest] = argv;
  if (command === "chat") {
    const { flags } = resolvedDeps.parseFlags(rest);
    await resolvedDeps.runChatTui({ flags });
    return;
  }

  const { flags } = resolvedDeps.parseFlags(rest);

  if (command === "parse") {
    await resolvedDeps.runParse(flags);
    return;
  }
  if (command === "optimize") {
    await resolvedDeps.runOptimize(flags);
    return;
  }
  if (command === "generate") {
    await resolvedDeps.runGenerate(flags);
    return;
  }
  if (command === "prepare-export") {
    await resolvedDeps.runPrepareExport(flags);
    return;
  }
  if (command === "validate") {
    await resolvedDeps.runValidate(flags);
    return;
  }
  if (command === "analyze-jd") {
    await resolvedDeps.runAnalyzeJd(flags);
    return;
  }
  if (command === "grammar-check") {
    await resolvedDeps.runGrammarCheck(flags);
    return;
  }
  if (command === "template") {
    await resolvedDeps.runTemplateCommand(rest);
    return;
  }

  throw new Error(`Unknown command '${command}'.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    const message = err?.stack || err?.message || String(err);
    console.error(`[cn-resume] ERROR: ${message}`);
    process.exit(1);
  });
}
