import { createChatSession, loadNamedSession } from "./session.js";
import { selectTemplateCandidate } from "./agent.js";

function cloneRuntime(runtime) {
  return {
    ...runtime,
    config: { ...(runtime?.config || {}) },
    session: structuredClone(runtime?.session || createChatSession())
  };
}

export function executeSlashCommand(runtime, input) {
  const trimmed = String(input || "").trim();
  const [command, ...args] = trimmed.split(/\s+/);
  const next = cloneRuntime(runtime);

  if (command === "/go") {
    return { runtime: next, message: "go", exit: false };
  }
  if (command === "/cancel") {
    return { runtime: next, message: "cancel", exit: false };
  }
  if (command === "/quit") {
    return { runtime: next, message: "quit", exit: true };
  }
  if (command === "/help") {
    return { runtime: next, message: "可用命令：/go /cancel /quit /choose-template <name>", exit: false };
  }
  if (command === "/clear") {
    return {
      runtime: {
        ...next,
        session: createChatSession()
      },
      message: "已清空当前会话。",
      exit: false
    };
  }
  if (command === "/load") {
    const name = String(args[0] || "").trim();
    if (!name) {
      throw new Error("load requires a session name");
    }
    return {
      runtime: {
        ...next,
        session: loadNamedSession(name, next.homeDir)
      },
      message: `已加载会话 ${name}`,
      exit: false
    };
  }
  if (command === "/choose-template") {
    const name = String(args[0] || "").trim();
    if (!name) {
      throw new Error("choose-template requires a template name");
    }
    return {
      runtime: {
        ...next,
        session: selectTemplateCandidate(next.session, name)
      },
      message: `已选择模板 ${name}`,
      exit: false
    };
  }

  throw new Error(`unsupported slash command '${trimmed}'`);
}
