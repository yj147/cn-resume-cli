import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function loadLocalEnvFile() {
  const envPath = path.join(os.homedir(), ".cn-resume", "ai.env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const idx = normalized.indexOf("=");
    if (idx <= 0) continue;
    const key = normalized.slice(0, idx).trim();
    if (!key) continue;
    if (process.env[key] && String(process.env[key]).trim()) {
      continue;
    }
    let value = normalized.slice(idx + 1).trim();
    if (!value) continue;
    if (
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      process.env[key] = value;
    }
  }
}

