import { pathToFileURL } from "node:url";
import { loadLocalEnvFile } from "./env.js";
import { parseFlags, usage } from "./cli/args.js";
import {
  runAnalyzeJd,
  runGenerate,
  runGrammarCheck,
  runOptimize,
  runParse,
  runTemplateCommand,
  runValidate
} from "./commands.js";

export async function main(argv) {
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  loadLocalEnvFile();

  const [command, ...rest] = argv;
  const { flags } = parseFlags(rest);

  if (command === "parse") {
    await runParse(flags);
    return;
  }
  if (command === "optimize") {
    await runOptimize(flags);
    return;
  }
  if (command === "generate") {
    await runGenerate(flags);
    return;
  }
  if (command === "validate") {
    await runValidate(flags);
    return;
  }
  if (command === "analyze-jd") {
    await runAnalyzeJd(flags);
    return;
  }
  if (command === "grammar-check") {
    await runGrammarCheck(flags);
    return;
  }
  if (command === "template") {
    await runTemplateCommand(rest);
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

