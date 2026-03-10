const AI_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
export const AI_MAX_ATTEMPTS = 3;
const AI_RETRY_BASE_MS = 700;
const AI_DEBUG =
  String(process.env.CN_RESUME_AI_DEBUG || process.env.AI_DEBUG || "")
    .trim()
    .toLowerCase() === "1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue) {
  const raw = String(headerValue || "").trim();
  if (!raw) {
    return 0;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(raw);
  if (!Number.isFinite(dateMs)) {
    return 0;
  }
  const delta = dateMs - Date.now();
  return delta > 0 ? delta : 0;
}

function computeBackoffMs(attempt, retryAfterMs = 0) {
  const exp = AI_RETRY_BASE_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 120);
  return Math.max(exp + jitter, retryAfterMs || 0);
}

function parseJsonObject(rawText, contextName) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error(`${contextName}: empty AI response content`);
  }
  const stripped = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const jsonStart = stripped.indexOf("{");
    const jsonEnd = stripped.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(stripped.slice(jsonStart, jsonEnd + 1));
      } catch {
        throw new Error(`${contextName}: AI response is not valid JSON`);
      }
    }
    throw new Error(`${contextName}: AI response is not valid JSON`);
  }
}

function extractAssistantContent(payload, taskName) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const combined = content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          return String(entry.text || entry.content || "");
        }
        return "";
      })
      .join("")
      .trim();
    if (combined) {
      return combined;
    }
  }
  throw new Error(`[AI_CALL] ${taskName} response missing choices[0].message.content`);
}

function shouldFallbackFromJsonSchema(status, errorText) {
  if (![400, 404, 415, 422].includes(Number(status))) {
    return false;
  }
  const text = String(errorText || "").toLowerCase();
  const keywords = ["json_schema", "response_format", "unsupported", "not support", "invalid request", "schema"];
  return keywords.some((keyword) => text.includes(keyword));
}

function buildResponseFormat(strategy, schemaSpec) {
  if (strategy === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: schemaSpec.name,
        strict: true,
        schema: schemaSpec.schema
      }
    };
  }
  return { type: "json_object" };
}

export async function callAiJson(taskName, options, promptPayload, schemaSpec, userContentOverride = undefined) {
  if (!options.apiKey) {
    throw new Error(`[ENV_SETUP] ${taskName} requires CN_RESUME_API_KEY or OPENAI_API_KEY`);
  }
  if (!options.model) {
    throw new Error(`[ENV_SETUP] ${taskName} requires --model or CN_RESUME_AI_MODEL`);
  }

  const endpoint = `${options.baseUrl}/chat/completions`;
  const timeoutMsRaw = process.env.CN_RESUME_AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || "";
  const timeoutMs = (() => {
    const numeric = Number(timeoutMsRaw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    return 60_000;
  })();
  const userContent = userContentOverride === undefined ? JSON.stringify(promptPayload) : userContentOverride;
  const messages = [
    {
      role: "system",
      content:
        [
          "你是简历评估引擎。",
          "严格按给定 schema 输出 JSON 对象，不允许输出解释、markdown、代码块。",
          "字段缺失、字段类型错误、分数越界都视为失败。"
        ].join(" ")
    },
    {
      role: "user",
      content: userContent
    }
  ];

  let fallbackToJsonObject = false;
  let lastError = null;
  const strategies = ["json_schema", "json_object"] as const;

  for (const strategy of strategies) {
    if (strategy === "json_object" && !fallbackToJsonObject) {
      continue;
    }

    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${options.apiKey}`
            },
            body: JSON.stringify({
              model: options.model,
              temperature: 0,
              response_format: buildResponseFormat(strategy, schemaSpec),
              messages
            })
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          const text = await response.text();
          if (strategy === "json_schema" && shouldFallbackFromJsonSchema(response.status, text)) {
            fallbackToJsonObject = true;
            console.error(
              `[cn-resume] WARN: provider rejected json_schema for ${taskName}; switching to json_object with strict local schema gate`
            );
            break;
          }
          if (AI_RETRYABLE_STATUS.has(response.status) && attempt < AI_MAX_ATTEMPTS) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
            const delayMs = computeBackoffMs(attempt, retryAfterMs);
            if (AI_DEBUG) {
              console.error(
                `[cn-resume] DEBUG: retrying ${taskName} after ${delayMs}ms (status=${response.status} attempt=${attempt}/${AI_MAX_ATTEMPTS} strategy=${strategy} model=${options.model})`
              );
            }
            await sleep(delayMs);
            continue;
          }
          throw new Error(
            `[AI_CALL] ${taskName} request failed (${response.status}) [strategy=${strategy} attempt=${attempt}/${AI_MAX_ATTEMPTS} model=${options.model} base_url=${options.baseUrl}]: ${text.slice(0, 600)}`
          );
        }

        const payload = await response.json();
        const content = extractAssistantContent(payload, taskName);
        return parseJsonObject(content, taskName);
      } catch (error) {
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
          lastError = new Error(
            `[AI_CALL] ${taskName} request timed out after ${timeoutMs}ms [strategy=${strategy} attempt=${attempt}/${AI_MAX_ATTEMPTS} model=${options.model} base_url=${options.baseUrl}]`
          );
        } else {
          lastError = error;
        }
        if (strategy === "json_schema" && fallbackToJsonObject) {
          break;
        }
        if (attempt < AI_MAX_ATTEMPTS) {
          const delayMs = computeBackoffMs(attempt);
          if (AI_DEBUG) {
            console.error(
              `[cn-resume] DEBUG: retrying ${taskName} after ${delayMs}ms (error=${String(error?.message || error)} attempt=${attempt}/${AI_MAX_ATTEMPTS} strategy=${strategy} model=${options.model})`
            );
          }
          await sleep(delayMs);
          continue;
        }
        if (strategy === "json_schema" && fallbackToJsonObject) {
          break;
        }
      }
    }
  }

  throw lastError || new Error(`[AI_CALL] ${taskName} failed with unknown error`);
}

export async function runAiWithSchemaRecovery(taskName, options, basePrompt, schemaSpec, validator) {
  let prompt = basePrompt;
  let lastSchemaError = null;

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    const aiReport = await callAiJson(taskName, options, prompt, schemaSpec);
    try {
      const normalized = validator(aiReport);
      return { normalized, aiReport };
    } catch (error) {
      lastSchemaError = error;
      if (attempt >= AI_MAX_ATTEMPTS) {
        break;
      }
      prompt = {
        ...basePrompt,
        schema_repair: {
          attempt: attempt + 1,
          reason: String(error?.message || error),
          previous_output: aiReport
        }
      };
    }
  }

  throw new Error(
    `[SCHEMA] ${taskName} response invalid after ${AI_MAX_ATTEMPTS} attempts: ${String(lastSchemaError?.message || lastSchemaError)}`
  );
}
