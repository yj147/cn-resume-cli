import test from "node:test";
import assert from "node:assert/strict";

const answerModule = await import("../dist/chat/answer.js");

test("streamChatAnswer strips provider protocol markers before returning assistant text", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        choices: [
          {
            message: {
              content: `assistant_started
你好，我先帮你解析文件。
<minimax:tool_call>
<invoke name="resume.import">
<parameter name="filePath">C:\\Users\\PC\\Documents\\新建简历 fda0cf.pdf</parameter>
</invoke>
</minimax:tool_call>`
            }
          }
        ]
      };
    }
  });

  try {
    let chunk = "";
    const text = await answerModule.streamChatAnswer(
      {
        config: {
          apiKey: "test-key",
          model: "test-model",
          baseUrl: "https://example.com/v1"
        }
      },
      "hi",
      (value) => {
        chunk += value;
      }
    );

    assert.equal(text, "你好，我先帮你解析文件。");
    assert.equal(chunk, "你好，我先帮你解析文件。");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
