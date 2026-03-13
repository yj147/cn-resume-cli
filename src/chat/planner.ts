function extractInputPath(input) {
  const match = String(input || "").match(/(?:^|\s)([^\s]+?\.(?:pdf|json|txt|md|docx))(?:\s|$)/i);
  return match?.[1] || "";
}

function hasCurrentResume(runtime) {
  return Boolean(runtime?.session?.currentResume?.model);
}

function looksLikeAuthoringInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed || trimmed.length < 8) {
    return false;
  }
  if (trimmed.includes("\n")) {
    return true;
  }
  return /(我叫|我是|邮箱|电话|手机|职位|求职|教育|学校|技能|经历|项目|负责|参与|熟悉|擅长)/.test(trimmed);
}

export async function planChatTurn(runtime, input) {
  const trimmed = String(input || "").trim();
  const inputPath = extractInputPath(trimmed);
  if (inputPath) {
    return {
      type: "plan",
      summary: "解析简历文件",
      action: {
        type: "parse-resume",
        inputPath
      }
    };
  }

  if (!hasCurrentResume(runtime) && looksLikeAuthoringInput(trimmed)) {
    return {
      type: "plan",
      summary: "根据你的口述生成简历草稿",
      action: {
        type: "author-resume",
        inputText: trimmed
      }
    };
  }

  if (/(优化|润色|改写)/.test(trimmed)) {
    return {
      type: "plan",
      summary: "优化当前简历",
      action: {
        type: "optimize-resume",
        feedbackText: "",
        confirm: false,
        jdText: String(runtime?.session?.currentJd?.text || "")
      }
    };
  }

  if (/(推荐|预览|对比|比较).*(模板)|(模板).*(推荐|预览|对比|比较)/.test(trimmed)) {
    return {
      type: "plan",
      summary: "基于当前内容生成模板对比预览",
      action: {
        type: "recommend-template"
      }
    };
  }

  return {
    type: "answer",
    message: "我可以帮你解析简历文件，或直接根据你的口述先生成一版简历草稿。"
  };
}
