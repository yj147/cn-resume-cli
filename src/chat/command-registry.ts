import { createChatSession, loadNamedSession } from "./session.js";
import { acceptPendingPatch, rejectPendingPatch, selectTemplateCandidate } from "./agent.js";

export const SLASH_COMMANDS = {
  GO: "/go",
  CANCEL: "/cancel",
  QUIT: "/quit",
  HELP: "/help",
  CLEAR: "/clear",
  LOAD: "/load",
  CHOOSE_TEMPLATE: "/choose-template",
  ACCEPT_PATCH: "/accept-patch",
  REJECT_PATCH: "/reject-patch"
} as const;

export const SLASH_COMMAND_NAMES = Object.values(SLASH_COMMANDS);

function cloneRuntime(runtime) {
  return {
    ...runtime,
    config: { ...(runtime?.config || {}) },
    session: structuredClone(runtime?.session || createChatSession())
  };
}

function resolvePatchTarget(target, reason = "") {
  return target.startsWith("patch-")
    ? { patchId: target, reason }
    : { module: target, reason };
}

export const SLASH_COMMAND_REGISTRY = [
  {
    name: SLASH_COMMANDS.GO,
    usage: SLASH_COMMANDS.GO,
    execute(next) {
      return { runtime: next, message: "go", exit: false };
    }
  },
  {
    name: SLASH_COMMANDS.CANCEL,
    usage: SLASH_COMMANDS.CANCEL,
    execute(next) {
      return { runtime: next, message: "cancel", exit: false };
    }
  },
  {
    name: SLASH_COMMANDS.QUIT,
    usage: SLASH_COMMANDS.QUIT,
    execute(next) {
      return { runtime: next, message: "quit", exit: true };
    }
  },
  {
    name: SLASH_COMMANDS.HELP,
    usage: SLASH_COMMANDS.HELP,
    execute(next) {
      return {
        runtime: next,
        message: `可用命令：${SLASH_COMMAND_REGISTRY.map((entry) => entry.usage).join(" ")}`,
        exit: false
      };
    }
  },
  {
    name: SLASH_COMMANDS.CLEAR,
    usage: SLASH_COMMANDS.CLEAR,
    execute(next) {
      return {
        runtime: {
          ...next,
          session: createChatSession()
        },
        message: "已清空当前会话。",
        exit: false
      };
    }
  },
  {
    name: SLASH_COMMANDS.LOAD,
    usage: `${SLASH_COMMANDS.LOAD} <name>`,
    execute(next, args) {
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
  },
  {
    name: SLASH_COMMANDS.CHOOSE_TEMPLATE,
    usage: `${SLASH_COMMANDS.CHOOSE_TEMPLATE} <name>`,
    execute(next, args) {
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
  },
  {
    name: SLASH_COMMANDS.ACCEPT_PATCH,
    usage: `${SLASH_COMMANDS.ACCEPT_PATCH} <patch-id|module>`,
    execute(next, args) {
      const target = String(args[0] || "").trim();
      if (!target) {
        throw new Error("accept-patch requires a patch id or module name");
      }
      return {
        runtime: {
          ...next,
          session: acceptPendingPatch(next.session, resolvePatchTarget(target))
        },
        message: `已接受 patch ${target}`,
        exit: false
      };
    }
  },
  {
    name: SLASH_COMMANDS.REJECT_PATCH,
    usage: `${SLASH_COMMANDS.REJECT_PATCH} <patch-id|module> [reason]`,
    execute(next, args) {
      const target = String(args[0] || "").trim();
      if (!target) {
        throw new Error("reject-patch requires a patch id or module name");
      }
      const reason = String(args.slice(1).join(" ") || "").trim();
      return {
        runtime: {
          ...next,
          session: rejectPendingPatch(next.session, resolvePatchTarget(target, reason))
        },
        message: `已拒绝 patch ${target}${reason ? `：${reason}` : ""}`,
        exit: false
      };
    }
  }
];

export function runRegisteredSlashCommand(runtime, command, args = []) {
  const definition = SLASH_COMMAND_REGISTRY.find((item) => item.name === command);
  if (!definition) {
    return null;
  }
  return {
    command: definition.name,
    ...definition.execute(cloneRuntime(runtime), args)
  };
}
