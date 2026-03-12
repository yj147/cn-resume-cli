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
  assert.equal(planned.tasks.length, 1);
  assert.equal(planned.tasks[0].status, "waiting_approval");
  assert.equal(planned.transcript.at(-2).type, "plan_proposed");
  assert.equal(planned.transcript.at(-1).type, "approval_requested");

  const confirmed = await agentModule.confirmPendingPlan(planned, {
    runTool: async (action) => {
      executed = true;
      return {
        resumeDraft: {
          draftId: "draft-parse-1",
          source: "parse-resume",
          summary: "解析结果待确认",
          patches: [
            {
              module: "basic",
              nextValue: { name: "张三" },
              source: "parsed_exact",
              severity: "info",
              rollback: {
                strategy: "replace",
                target: "currentResume.model.basic"
              }
            }
          ]
        },
        artifactPatch: {
          latestModelPath: "/tmp/parsed.json"
        },
        taskPatch: {
          status: "done"
        }
      };
    }
  });

  assert.equal(executed, true);
  assert.equal(confirmed.state.status, "idle");
  assert.equal(confirmed.currentResume, undefined);
  assert.equal(Array.isArray(confirmed.pendingPatches), true);
  assert.equal(confirmed.pendingPatches[0].module, "basic");
  assert.equal(confirmed.pendingPlan, undefined);
  assert.equal(confirmed.pendingApproval, undefined);
  assert.equal(confirmed.tasks.length, 1);
  assert.equal(confirmed.tasks[0].status, "done");
  assert.equal(confirmed.artifacts.latestModelPath, "/tmp/parsed.json");
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
  assert.equal(awaiting.currentResume.sourcePath, "/tmp/resume.json");
  assert.equal(Array.isArray(awaiting.pendingPatches), true);
  assert.equal(awaiting.pendingPatches[0].module, "experience");
  assert.equal(awaiting.tasks.length, 1);
  assert.equal(awaiting.tasks[0].status, "waiting_phase_b_feedback");
  assert.ok(awaiting.artifacts.latestModelPath);
  assert.equal(awaiting.transcript.some((item) => item.type === "task_started"), true);
  assert.equal(awaiting.transcript.some((item) => item.type === "task_finished" && item.status === "done"), true);

  const finished = await agentModule.confirmPhaseB(awaiting, "请强化量化结果", {
    runTool: toolsModule.runChatTool
  });

  assert.equal(finished.state.status, "idle");
  assert.equal(finished.phaseB.status, "confirmed");
  assert.equal(finished.tasks[0].status, "done");
  assert.ok(finished.artifacts.latestModelPath);
  assert.equal(finished.currentResume.sourcePath, "/tmp/resume.json");
  assert.equal(finished.currentResume.model.meta?.phase_b, undefined);
  assert.equal(finished.pendingPatches.length, 1);
  assert.equal(finished.transcript.some((item) => item.type === "task_started"), true);
  assert.equal(finished.transcript.some((item) => item.type === "task_finished" && item.status === "done"), true);
});

test("optimize tool returns draft patch and phase state without direct confirmed resume write", async () => {
  const session = sessionModule.createChatSession("2026-03-11T03:35:00.000Z");
  session.currentResume = {
    sourcePath: "/tmp/resume.json",
    model: loadFixture("sample-resume-contract.json")
  };

  const result = await toolsModule.runChatTool(
    {
      type: "optimize-resume",
      feedbackText: "",
      confirm: false,
      jdText: "Go Redis"
    },
    session
  );

  assert.equal(result.sessionPatch?.currentResume, undefined);
  assert.equal(result.resumeDraft.source, "optimize-resume");
  assert.equal(result.resumeDraft.patches[0].module, "experience");
  assert.equal(result.taskPatch.status, "waiting_phase_b_feedback");
  assert.equal(result.phaseB.status, "awaiting_feedback");
});

test("agent marks task as error when tool execution fails", async () => {
  const session = sessionModule.createChatSession("2026-03-11T03:20:00.000Z");
  const planned = agentModule.planToolAction(session, {
    summary: "解析简历文件",
    action: {
      type: "parse-resume",
      inputPath: "/tmp/resume.txt"
    }
  });

  let capturedError;
  await assert.rejects(
    () =>
      agentModule.confirmPendingPlan(planned, {
        runTool: async () => {
          throw new Error("mock parse failure");
        }
      }),
    (error) => {
      capturedError = error;
      return true;
    }
  );

  assert.equal(capturedError.session.tasks.length, 1);
  assert.equal(capturedError.session.tasks[0].status, "error");
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

test("parse tool returns draft patch payload without direct current resume write", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cn-resume-parse-tool-"));
  const inputPath = path.join(tempDir, "resume.txt");
  fs.writeFileSync(inputPath, "杨进\nyj@example.com\n13800000000\n职位：全栈工程师\n", "utf8");

  try {
    const result = await toolsModule.runChatTool(
      {
        type: "parse-resume",
        inputPath
      },
      sessionModule.createChatSession("2026-03-11T03:40:00.000Z")
    );

    assert.equal(result.sessionPatch?.currentResume, undefined);
    assert.equal(result.resumeDraft.source, "parse-resume");
    assert.equal(result.resumeDraft.patches[0].module, "basic");
    assert.ok(result.artifactPatch.latestModelPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
