import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDir } from "../core/io.js";
import { getCnResumeHome } from "../env.js";

function resolveEnvFile(homeDir = os.homedir()) {
  return path.join(getCnResumeHome(homeDir), "ai.env");
}

function parseEnvFile(homeDir = os.homedir()) {
  const envFile = resolveEnvFile(homeDir);
  if (!fs.existsSync(envFile)) {
    return {};
  }
  const entries: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const index = normalized.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = normalized.slice(0, index).trim();
    const value = normalized.slice(index + 1).trim();
    if (key) {
      entries[key] = value;
    }
  }
  return entries;
}

export function loadChatConfig(homeDir = os.homedir()) {
  const entries = parseEnvFile(homeDir);
  return {
    apiKey: String(process.env.CN_RESUME_API_KEY || process.env.OPENAI_API_KEY || entries.CN_RESUME_API_KEY || "").trim(),
    baseUrl: String(process.env.CN_RESUME_BASE_URL || process.env.OPENAI_BASE_URL || entries.CN_RESUME_BASE_URL || "").trim(),
    model: String(process.env.CN_RESUME_AI_MODEL || entries.CN_RESUME_AI_MODEL || "").trim()
  };
}

export function saveChatConfig(config, homeDir = os.homedir()) {
  const next = {
    apiKey: String(config?.apiKey || "").trim(),
    baseUrl: String(config?.baseUrl || "").trim(),
    model: String(config?.model || "").trim()
  };
  const envFile = resolveEnvFile(homeDir);
  ensureDir(path.dirname(envFile));
  fs.writeFileSync(
    envFile,
    [
      `CN_RESUME_API_KEY=${next.apiKey}`,
      `CN_RESUME_BASE_URL=${next.baseUrl}`,
      `CN_RESUME_AI_MODEL=${next.model}`
    ].join("\n") + "\n",
    "utf8"
  );
  process.env.CN_RESUME_API_KEY = next.apiKey;
  process.env.CN_RESUME_BASE_URL = next.baseUrl;
  process.env.CN_RESUME_AI_MODEL = next.model;
  return next;
}
