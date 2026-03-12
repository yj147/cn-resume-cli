function extractInputPath(input) {
  const match = String(input || "").match(/(?:^|\s)([^\s]+?\.(?:pdf|json|txt|md|docx))(?:\s|$)/i);
  return match?.[1] || "";
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

  if (/[优化|润色|改写]/.test(trimmed)) {
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

  return {
    type: "answer",
    message: "我可以帮你解析简历文件，或在加载简历后优化当前内容。"
  };
}
