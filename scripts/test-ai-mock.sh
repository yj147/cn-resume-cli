#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT_FILE="$(mktemp /tmp/cn-resume-mock-port.XXXXXX)"
OUT_DIR="$(mktemp -d /tmp/cn-resume-ai-mock.XXXXXX)"
HOME_DIR="$(mktemp -d /tmp/cn-resume-ai-mock-home.XXXXXX)"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$PORT_FILE"
  rm -rf "$HOME_DIR"
}
trap cleanup EXIT

node ./scripts/mock-openai-server.mjs --port-file "$PORT_FILE" >/dev/null 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 50); do
  [[ -s "$PORT_FILE" ]] && break
  sleep 0.05
done
[[ -s "$PORT_FILE" ]] || {
  echo "[ai-mock] ERROR: mock server did not start" >&2
  exit 1
}

PORT="$(tr -d '\n' <"$PORT_FILE")"

mkdir -p "$HOME_DIR/.cn-resume"
cat >"$HOME_DIR/.cn-resume/ai.env" <<EOF
CN_RESUME_API_KEY='mock-key'
CN_RESUME_BASE_URL='http://127.0.0.1:${PORT}'
CN_RESUME_AI_MODEL='mock-model'
CN_RESUME_PROMPT_VERSION='v1'
EOF

export HOME="$HOME_DIR"
unset CN_RESUME_API_KEY CN_RESUME_BASE_URL CN_RESUME_AI_MODEL CN_RESUME_PROMPT_VERSION
unset OPENAI_API_KEY OPENAI_BASE_URL OPENAI_MODEL AI_API_KEY AI_BASE_URL

node bin/cn-resume.js parse \
  --engine ai \
  --input fixtures/parser/skill-grouping.txt \
  --output "$OUT_DIR/parse.ai.json"

node bin/cn-resume.js parse \
  --engine ai \
  --input fixtures/pdf/text-rich.pdf \
  --output "$OUT_DIR/parse.pdf.text.json"

node bin/cn-resume.js parse \
  --engine ai \
  --input fixtures/pdf/scanned-low-text.pdf \
  --output "$OUT_DIR/parse.pdf.scan.json"

node bin/cn-resume.js optimize \
  --engine ai \
  --input fixtures/sample-resume-contract.json \
  --jd fixtures/sample-jd.txt \
  --feedback "mock optimize" \
  --confirm \
  --output "$OUT_DIR/optimize.ai.json"

node --input-type=module - "$OUT_DIR" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2];

function load(name) {
  const file = path.join(outDir, name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[ai-mock] FAIL: ${message}`);
    process.exit(1);
  }
}

const parsed = load("parse.ai.json");
assert(parsed?.basic?.name === "Mock User", "parse ai should use mock output basic.name");
assert(parsed?.basic?.email, "parse ai should include email");
assert(parsed?.basic?.phone, "parse ai should include phone");
assert(Array.isArray(parsed?.skills), "parse ai should include skills array");

const pdfText = load("parse.pdf.text.json");
assert(pdfText?.basic?.name === "Mock User", "parse pdf (text) should return mock output basic.name");

const pdfScan = load("parse.pdf.scan.json");
assert(pdfScan?.basic?.name === "Mock User", "parse pdf (scan) should return mock output basic.name");

const optimized = load("optimize.ai.json");
assert(optimized?.meta?.phase_b?.confirmed === true, "optimize ai should preserve phase_b confirmation");

console.log("[ai-mock] PASS");
NODE
