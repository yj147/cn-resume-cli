#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "$HOME/.cn-resume/ai.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HOME/.cn-resume/ai.env"
  set +a
fi

export CN_RESUME_API_KEY="${CN_RESUME_API_KEY:-${OPENAI_API_KEY:-}}"
export CN_RESUME_BASE_URL="${CN_RESUME_BASE_URL:-${OPENAI_BASE_URL:-https://api.openai.com/v1}}"
export CN_RESUME_AI_MODEL="${CN_RESUME_AI_MODEL:-${OPENAI_MODEL:-gpt-4o-mini}}"
export CN_RESUME_EVAL_ENGINE="${CN_RESUME_EVAL_ENGINE:-hybrid}"
export CN_RESUME_PROMPT_VERSION="${CN_RESUME_PROMPT_VERSION:-v1}"

if [[ -z "${CN_RESUME_API_KEY:-}" ]]; then
  echo "BLOCKED: missing CN_RESUME_API_KEY/OPENAI_API_KEY" >&2
  exit 2
fi

OUT_DIR="$(mktemp -d /tmp/cn-resume-smoke.XXXXXX)"
INPUT_RESUME="fixtures/sample-resume-contract.json"
INPUT_JD="fixtures/sample-jd.txt"

echo "[smoke] output: $OUT_DIR"

node bin/cn-resume.js parse \
  --input "$INPUT_RESUME" \
  --output "$OUT_DIR/parsed.json"

node bin/cn-resume.js optimize \
  --input "$OUT_DIR/parsed.json" \
  --jd "$INPUT_JD" \
  --output "$OUT_DIR/optimized.await.json"

set +e
node bin/cn-resume.js validate \
  --input "$OUT_DIR/optimized.await.json" \
  --jd "$INPUT_JD" \
  --engine "$CN_RESUME_EVAL_ENGINE" \
  --model "$CN_RESUME_AI_MODEL" \
  --prompt-version "$CN_RESUME_PROMPT_VERSION" \
  --output "$OUT_DIR/validate.blocked.json" >/dev/null 2>&1
STATUS="$?"
set -e
if [[ "$STATUS" -eq 0 ]]; then
  echo "[smoke] ERROR: expected phase_b_unconfirmed failure but validate succeeded" >&2
  exit 1
fi

node bin/cn-resume.js optimize \
  --input "$OUT_DIR/parsed.json" \
  --jd "$INPUT_JD" \
  --feedback "请补齐高并发与Redis相关成果，删除模板占位符" \
  --confirm \
  --output "$OUT_DIR/optimized.json"

node bin/cn-resume.js validate \
  --input "$OUT_DIR/optimized.json" \
  --jd "$INPUT_JD" \
  --engine "$CN_RESUME_EVAL_ENGINE" \
  --model "$CN_RESUME_AI_MODEL" \
  --prompt-version "$CN_RESUME_PROMPT_VERSION" \
  --output "$OUT_DIR/validate.json"

node bin/cn-resume.js analyze-jd \
  --input "$OUT_DIR/optimized.json" \
  --jd "$INPUT_JD" \
  --engine "$CN_RESUME_EVAL_ENGINE" \
  --model "$CN_RESUME_AI_MODEL" \
  --prompt-version "$CN_RESUME_PROMPT_VERSION" \
  --output "$OUT_DIR/analyze-jd.json"

node bin/cn-resume.js grammar-check \
  --input "$OUT_DIR/optimized.json" \
  --engine "$CN_RESUME_EVAL_ENGINE" \
  --model "$CN_RESUME_AI_MODEL" \
  --prompt-version "$CN_RESUME_PROMPT_VERSION" \
  --output "$OUT_DIR/grammar.json"

node - "$OUT_DIR/optimized.json" "$OUT_DIR/export-ready.json" <<'NODE'
const fs = require('node:fs');

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const model = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

model.render_config = {
  ...(model.render_config || {}),
  template: model.render_config?.template || 'elegant'
};
model.meta = {
  ...(model.meta || {}),
  reviewResult: {
    summary: {
      blocked: false
    }
  },
  layoutResult: {
    status: 'ready',
    pageCount: 1,
    confirmed: true
  }
};

fs.writeFileSync(outputPath, JSON.stringify(model, null, 2));
NODE

node bin/cn-resume.js generate \
  --input "$OUT_DIR/export-ready.json" \
  --template elegant \
  --output "$OUT_DIR/resume.txt"

for f in parsed.json optimized.await.json optimized.json validate.json analyze-jd.json grammar.json export-ready.json resume.txt; do
  [[ -s "$OUT_DIR/$f" ]] || {
    echo "[smoke] ERROR: missing output $OUT_DIR/$f" >&2
    exit 1
  }
done

echo "[smoke] PASS"
