import os from "node:os";
import { planToolAction, confirmPendingPlan, confirmPhaseB } from "./agent.js";
import { streamChatAnswer } from "./answer.js";
import { CHAT_STATES } from "./controller.js";
import { loadChatConfig } from "./config.js";
import { createChatEvent } from "./events.js";
import { planChatTurn } from "./planner.js";
import { loadActiveSession, loadNamedSession, saveActiveSession } from "./session.js";
import { executeSlashCommand } from "./slash.js";
import { runChatTool } from "./tools.js";

function loadChatSession(flags, homeDir) {
  const resume = String(flags?.resume || "").trim();
  if (!resume || resume === "last") {
    return loadActiveSession(homeDir);
  }
  return loadNamedSession(resume, homeDir);
}

function cloneRuntime(runtime) {
  return {
    ...runtime,
    config: { ...runtime.config },
    session: structuredClone(runtime.session)
  };
}

function idleSession(session) {
  session.pendingPlan = undefined;
  session.pendingApproval = undefined;
  session.state = { status: CHAT_STATES.IDLE };
  return session;
}

function defaultWrite(text) {
  process.stdout.write(`${text}\n`);
}

async function defaultPlanInput(runtime, input) {
  return planChatTurn(runtime, input);
}

function transcriptRef(session) {
  if (!Array.isArray(session.transcript)) {
    session.transcript = [];
  }
  if (session.transcript === session.messages) {
    session.transcript = [...session.transcript];
  }
  return session.transcript;
}

function emitEvent(session, io, event, options: Record<string, unknown> = {}) {
  if (options.persist !== false) {
    transcriptRef(session).push(event);
  }

  if (io.emit) {
    io.emit(event);
  }

  if (options.message && typeof options.message === "object") {
    session.messages.push(options.message);
  }

  if (!io.emit && typeof options.stdoutText === "string" && options.stdoutText) {
    io.write(options.stdoutText);
  }
}

function emitTranscriptDelta(io, session, fromIndex) {
  if (!io.emit || !Array.isArray(session?.transcript)) {
    return;
  }
  for (let index = fromIndex; index < session.transcript.length; index += 1) {
    const item = session.transcript[index];
    if (item && typeof item === "object" && typeof item.type === "string") {
      io.emit(item);
    }
  }
}

function saveRuntime(runtime) {
  runtime.session = saveActiveSession(runtime.session, runtime.homeDir);
  return runtime;
}

function resolveChatHandlers(handlers = {}) {
  return {
    executeSlashCommand,
    planInput: defaultPlanInput,
    streamAnswer: streamChatAnswer,
    runTool: runChatTool,
    ...handlers
  };
}

async function handleSlashInput(runtime, input, handlers, io) {
  const slash = handlers.executeSlashCommand(runtime, input);
  let next = slash.runtime;

  if (input === "/go") {
    const fromIndex = Array.isArray(next.session?.transcript) ? next.session.transcript.length : 0;
    next.session = await confirmPendingPlan(next.session, { runTool: handlers.runTool });
    emitTranscriptDelta(io, next.session, fromIndex);
  } else if (input === "/cancel") {
    if (next.session.phaseB?.status === "awaiting_feedback") {
      emitEvent(
        next.session,
        io,
        createChatEvent("error", {
          message: "Phase B 待确认，不能取消。请输入反馈文本完成确认。"
        }),
        {
          message: {
            role: "error",
            content: "Phase B 待确认，不能取消。请输入反馈文本完成确认。"
          },
          stdoutText: "Phase B 待确认，不能取消。请输入反馈文本完成确认。"
        }
      );
    } else if (next.session.state.status === CHAT_STATES.WAITING_CONFIRM) {
      next.session = idleSession(next.session);
    }
  }

  if (slash.message && slash.message !== "go" && slash.message !== "cancel" && slash.message !== "quit") {
    emitEvent(
      next.session,
      io,
      createChatEvent("assistant_completed", {
        content: slash.message
      }),
      {
        message: {
          role: "assistant",
          content: slash.message
        },
        stdoutText: slash.message
      }
    );
  }

  saveRuntime(next);
  return {
    runtime: next,
    exit: Boolean(slash.exit)
  };
}

async function handleChatInput(runtime, input, handlers, io) {
  const next = cloneRuntime(runtime);
  emitEvent(
    next.session,
    io,
    createChatEvent("user_message", {
      content: input
    }),
    {
      message: {
        role: "user",
        content: input
      }
    }
  );

  if (next.session.phaseB?.status === "awaiting_feedback") {
    const fromIndex = Array.isArray(next.session?.transcript) ? next.session.transcript.length : 0;
    next.session = await confirmPhaseB(next.session, input, { runTool: handlers.runTool });
    emitTranscriptDelta(io, next.session, fromIndex);
    emitEvent(
      next.session,
      io,
      createChatEvent("assistant_completed", {
        content: "Phase B 已确认。"
      }),
      {
        message: {
          role: "assistant",
          content: "Phase B 已确认。"
        },
        stdoutText: "Phase B 已确认。"
      }
    );
    saveRuntime(next);
    return {
      runtime: next,
      exit: false
    };
  }

  const planned = await handlers.planInput(next, input);
  if (planned.type === "plan") {
    const fromIndex = Array.isArray(next.session?.transcript) ? next.session.transcript.length : 0;
    next.session = planToolAction(next.session, planned);
    emitTranscriptDelta(io, next.session, fromIndex);
    if (!io.emit) {
      io.write("请输入 /go 确认，或 /cancel 取消。");
    }
    saveRuntime(next);
    return {
      runtime: next,
      exit: false
    };
  }

  let answerText = planned.message;
  if (next.config.apiKey && next.config.model && handlers.streamAnswer) {
    answerText = "";
    await handlers.streamAnswer(next, input, (chunk) => {
      answerText += chunk;
      if (io.emit) {
        io.emit(
          createChatEvent("assistant_delta", {
            chunk
          })
        );
      } else if (io.writeChunk) {
        io.writeChunk(chunk);
      }
    });
    if (!io.emit && io.writeChunk) {
      io.writeChunk("\n");
    } else if (!io.emit) {
      io.write(answerText);
    }
  }

  emitEvent(
    next.session,
    io,
    createChatEvent("assistant_completed", {
      content: answerText
    }),
    {
      message: {
        role: "assistant",
        content: answerText
      },
      stdoutText: next.config.apiKey && next.config.model ? "" : answerText
    }
  );
  saveRuntime(next);
  return {
    runtime: next,
    exit: false
  };
}

export function loadChatRuntime(flags = {}, options: Record<string, unknown> = {}) {
  const optionHomeDir = options.homeDir;
  const homeDir = typeof optionHomeDir === "string" && optionHomeDir ? optionHomeDir : os.homedir();
  return {
    homeDir,
    config: loadChatConfig(homeDir),
    session: loadChatSession(flags, homeDir)
  };
}

export async function submitChatInput(runtime, input, io, handlers = {}) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return {
      runtime,
      exit: false
    };
  }

  const resolvedHandlers = resolveChatHandlers(handlers);
  if (trimmed.startsWith("/")) {
    return handleSlashInput(runtime, trimmed, resolvedHandlers, io);
  }

  return handleChatInput(runtime, trimmed, resolvedHandlers, io);
}

export async function runChatLoop(runtime, io, handlers = {}) {
  const resolvedIo = {
    readLine: io?.readLine,
    write: io?.write || defaultWrite,
    writeChunk: io?.writeChunk,
    emit: io?.emit
  };
  let next = saveRuntime(cloneRuntime(runtime));

  while (true) {
    const line = await resolvedIo.readLine();
    if (line == null) {
      break;
    }
    const transcriptIndex = Array.isArray(next.session?.transcript) ? next.session.transcript.length : 0;

    try {
      const result = await submitChatInput(next, line, resolvedIo, handlers);
      next = result.runtime;
      if (result.exit) {
        break;
      }
    } catch (error) {
      if (error?.session) {
        next = { ...next, session: error.session };
        emitTranscriptDelta(resolvedIo, next.session, transcriptIndex);
        if (!resolvedIo.emit) {
          resolvedIo.write(String(error?.message || error));
        }
      } else {
        emitEvent(
          next.session,
          resolvedIo,
          createChatEvent("error", {
            message: String(error?.message || error)
          }),
          {
            message: {
              role: "error",
              content: String(error?.message || error)
            },
            stdoutText: String(error?.message || error)
          }
        );
      }
      saveRuntime(next);
    }
  }

  return saveRuntime(next);
}
