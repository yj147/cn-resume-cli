import test from "node:test";
import assert from "node:assert/strict";

const agentModule = await import("../dist/chat/agent.js");
const provenanceModule = await import("../dist/core/provenance.js");
const sessionModule = await import("../dist/chat/session.js");

test("mutating tool task_finished event carries TUI diff payload without diagnostics noise", async () => {
  const session = sessionModule.createChatSession("2026-03-13T13:00:00.000Z");
  const planned = agentModule.planToolAction(session, {
    summary: "解析简历文件",
    action: {
      type: "parse-resume",
      inputPath: "/tmp/resume.txt"
    }
  });

  const confirmed = await agentModule.confirmPendingPlan(planned, {
    runTool: async () => ({
      resumeDraft: {
        draftId: "draft-parse-1",
        source: "parse-resume",
        summary: "解析结果待确认",
        patches: [
          {
            patchId: "patch-basic",
            module: "basic",
            previousValue: { name: { value: "旧名字" } },
            nextValue: { name: { value: "新名字" } },
            source: provenanceModule.FIELD_SOURCES.PARSED_EXACT,
            rollback: {
              strategy: "replace",
              target: "currentResume.model.basic"
            }
          }
        ]
      },
      taskPatch: {
        status: "done"
      }
    })
  });

  const finishedEvent = confirmed.transcript.find((item) => item.type === "task_finished" && item.status === "done");
  assert.ok(finishedEvent);
  assert.equal(finishedEvent.summary, "解析结果待确认");
  assert.equal(finishedEvent.patchCount, 1);
  assert.equal(finishedEvent.defaultExpanded, true);
  assert.equal(finishedEvent.hideDiagnostics, true);
  assert.deepEqual(
    finishedEvent.diffPreview.map((line) => line.kind),
    ["meta", "remove", "add"]
  );
  assert.match(finishedEvent.diffPreview[0].text, /basic/);
  assert.match(finishedEvent.diffPreview[1].text, /^basic:/);
  assert.match(finishedEvent.diffPreview[2].text, /^basic:/);
  assert.equal(/\[(WARN|INFO)\]/.test(JSON.stringify(confirmed.transcript)), false);
});
