import path from "node:path";

export function parseFlags(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { positional, flags };
}

export function usage() {
  return `
cn-resume CLI

Usage:
  cn-resume
  cn-resume chat [--resume last|<session-name>]
  cn-resume parse --input <file> --output <model.json> [--engine <rule|ai>] [--model <id>] [--prompt-version <vX>]
  cn-resume optimize --input <model.json|txt> [--jd <jd.txt>] [--engine <rule|ai>] [--model <id>] [--prompt-version <vX>] [--feedback <text>] [--confirm] --output <model.json>
  cn-resume prepare-export --input <model.json> [--jd <jd.txt>] [--template <name>] [--accept-multipage] [--engine <hybrid|ai|rule>] [--model <id>] [--prompt-version <vX>] --output <export-ready.json>
  cn-resume generate --input <model.json> --template <name> --output <file.{pdf|docx|html|txt|json}> [--fit-one-page]
  cn-resume validate --input <model.json|pdf> [--jd <jd.txt>] [--engine <hybrid|ai|rule>] [--model <id>] [--prompt-version <vX>] [--output <report.json>]
  cn-resume analyze-jd --input <model.json> --jd <jd.txt> [--engine <hybrid|ai|rule>] [--model <id>] [--prompt-version <vX>] [--output <report.json>]
  cn-resume grammar-check --input <model.json> [--engine <hybrid|ai|rule>] [--model <id>] [--prompt-version <vX>] [--output <report.json>]
  cn-resume template list
  cn-resume template preview --name <template> --output <preview.html>
  cn-resume template import --name <template> --file <template.html|template.txt>
  cn-resume template clone --source <template> --name <new-template>

Notes:
  - Default entry launches a fresh Chat TUI session.
  - Use 'cn-resume chat' to enter the Chat TUI explicitly.
  - Use 'cn-resume chat --resume last' to restore the last active session.
  - Supports a built-in template catalog (hard-cut to 16 names). Use 'cn-resume template list'.
  - Default evaluation engine is hybrid (AI output + rule hard gates).
  - Phase B is enforced for CLI-optimized models. Use optimize --feedback and finish with --confirm.
  - Pure CLI export loop: parse -> optimize --confirm -> prepare-export -> generate.
  - PDF generation uses Puppeteer (CHROME_PATH optional).
  - Default runtime baseline: Node.js 20+.
`.trim();
}

export function inferFormat(outputPath, explicitFormat) {
  if (explicitFormat) {
    return explicitFormat.toLowerCase();
  }
  const ext = path.extname(outputPath).toLowerCase().replace(".", "");
  return ext || "pdf";
}
