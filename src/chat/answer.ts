function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return sanitizeAssistantText(content);
  }
  if (Array.isArray(content)) {
    return sanitizeAssistantText(content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        return String(item?.text || item?.content || "");
      })
      .join("")
      .trim());
  }
  return "";
}

function sanitizeAssistantText(text) {
  return String(text || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .replace(/^\s*(assistant|tool)_(started|completed|finished)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function streamChatAnswer(runtime, input, onChunk) {
  const apiKey = String(runtime?.config?.apiKey || "").trim();
  const model = String(runtime?.config?.model || "").trim();
  const baseUrl = String(runtime?.config?.baseUrl || "").trim().replace(/\/$/, "");

  if (!apiKey) {
    throw new Error("BLOCKED: missing chat api key");
  }
  if (!model) {
    throw new Error("BLOCKED: missing chat model");
  }
  if (!baseUrl) {
    throw new Error("BLOCKED: missing chat base url");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你是 cn-resume 的聊天助手。只回答与简历、JD、求职表达相关的问题。"
        },
        {
          role: "user",
          content: String(input || "")
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`BLOCKED: chat answer request failed (${response.status})`);
  }

  const payload = await response.json();
  const text = extractAssistantText(payload);
  if (!text) {
    throw new Error("BLOCKED: chat answer response missing content");
  }
  onChunk(text);
  return text;
}
