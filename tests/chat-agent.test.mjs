import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const agentModule = await import("../dist/chat/agent.js");
const sessionModule = await import("../dist/chat/session.js");
const toolsModule = await import("../dist/chat/tools.js");

function loadFixture(name) {
  const file = path.join(process.cwd(), "fixtures", name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("agent plan confirmation gates tool execution until /go", async () => {
  assert.equal(typeof agentModule.planToolAction, "function");
  assert.equal(typeof agentModule.confirmPendingPlan, "function");

  const session = sessionModule.createChatSession("2026-03-11T03:00:00.000Z");
  const planned = agentModule.planToolAction(session, {
    summary: "解析简历文件",
    action: {
      type: "parse-resume",
      inputPath: "/tmp/resume.txt"
    }
  });

  let executed = false;
  assert.equal(planned.state.status, "waiting_confirm");
  assert.equal(planned.pendingPlan.summary, "解析简历文件");
  assert.equal(planned.pendingApproval.title, "解析简历文件");
  assert.equal(planned.transcript.at(-2).type, "plan_proposed");
  assert.equal(planned.transcript.at(-1).type, "approval_requested");

  const confirmed = await agentModule.confirmPendingPlan(planned, {
    runTool: async (action) => {
      executed = true;
      return {
        sessionPatch: {
          currentResume: {
            sourcePath: action.inputPath,
            model: { basics: { name: "张三" } }
          }
        }
      };
    }
  });

  assert.equal(executed, true);
  assert.equal(confirmed.state.status, "idle");
  assert.equal(confirmed.currentResume.sourcePath, "/tmp/resume.txt");
  assert.equal(confirmed.pendingPlan, undefined);
  assert.equal(confirmed.pendingApproval, undefined);
  assert.equal(confirmed.transcript.some((item) => item.type === "task_started"), true);
  assert.equal(confirmed.transcript.some((item) => item.type === "task_finished" && item.status === "done"), true);
});

test("agent phase b flow blocks on optimize until feedback confirmation", async () => {
  assert.equal(typeof agentModule.planToolAction, "function");
  assert.equal(typeof agentModule.confirmPendingPlan, "function");
  assert.equal(typeof agentModule.confirmPhaseB, "function");

  const session = sessionModule.createChatSession("2026-03-11T03:00:00.000Z");
  session.currentResume = {
    sourcePath: "/tmp/resume.json",
    model: loadFixture("sample-resume-contract.json")
  };

  const planned = agentModule.planToolAction(session, {
    summary: "优化当前简历",
    action: {
      type: "optimize-resume",
      feedbackText: "",
      confirm: false,
      jdText: "Go Redis"
    }
  });

  const awaiting = await agentModule.confirmPendingPlan(planned, {
    runTool: toolsModule.runChatTool
  });

  assert.equal(awaiting.state.status, "waiting_phase_b_feedback");
  assert.equal(awaiting.phaseB.status, "awaiting_feedback");
  assert.equal(awaiting.transcript.some((item) => item.type === "task_started"), true);
  assert.equal(awaiting.transcript.some((item) => item.type === "task_finished" && item.status === "done"), true);

  const finished = await agentModule.confirmPhaseB(awaiting, "请强化量化结果", {
    runTool: toolsModule.runChatTool
  });

  assert.equal(finished.state.status, "idle");
  assert.equal(finished.phaseB.status, "confirmed");
  assert.equal(finished.currentResume.model.meta.phase_b.confirmed, true);
  assert.equal(finished.transcript.some((item) => item.type === "task_started"), true);
  assert.equal(finished.transcript.some((item) => item.type === "task_finished" && item.status === "done"), true);
});

test("optimize tool fails explicitly when no resume is loaded", async () => {
  const session = sessionModule.createChatSession("2026-03-11T03:30:00.000Z");

  await assert.rejects(
    () =>
      toolsModule.runChatTool(
        {
          type: "optimize-resume",
          feedbackText: "",
          confirm: false,
          jdText: ""
        },
        session
      ),
    /BLOCKED: no current resume loaded/
  );
});
