#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return flags;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function buildResponse(content) {
  return {
    id: "mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
  };
}

const flags = parseFlags(process.argv.slice(2));
const port = Number(flags.port || 0);
const portFile = String(flags["port-file"] || "").trim();
if (!portFile) {
  console.error("mock-openai-server requires --port-file <path>");
  process.exit(2);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const payload = await readJson(req);
    const userMessage = (payload?.messages || []).find((m) => m && m.role === "user");
    let task = "";
    let prompt = null;
    const rawContent = userMessage ? userMessage.content : "";
    const promptText = (() => {
      if (typeof rawContent === "string") {
        return rawContent;
      }
      if (Array.isArray(rawContent)) {
        return rawContent
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
      }
      return "";
    })();
    if (promptText) {
      try {
        prompt = JSON.parse(promptText);
        task = String(prompt?.task || "");
      } catch {
        task = "";
      }
    }

    let content = '{"model":{}}';
    if (task === "parse") {
      content = JSON.stringify({
        model: {
          basic: {
            name: "Mock User",
            title: "后端工程师",
            email: "mock@example.com",
            phone: "13800000000",
            location: "深圳",
            website: "",
            summary: "用于测试 AI parse 引擎的 mock 输出。"
          },
          skills: [
            { category: "后端", items: [{ name: "Go" }, { name: "Redis" }] }
          ]
        },
        confidence: 0.9
      });
    } else if (task === "optimize") {
      content = JSON.stringify({ model: {}, confidence: 0.8 });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(buildResponse(content)));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(e?.message || e) }));
  }
});

server.listen(port, "127.0.0.1", () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  fs.writeFileSync(portFile, `${actualPort}\n`, "utf8");
  console.log(`[mock-openai] listening on ${actualPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
