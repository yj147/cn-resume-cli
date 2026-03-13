import test from "node:test";
import assert from "node:assert/strict";

const plannerModule = await import("../dist/chat/planner.js");

test("planner treats a Windows path with spaces as parse input", async () => {
  const plan = await plannerModule.planChatTurn(
    { session: {} },
    "C:\\Users\\PC\\Documents\\新建简历 fda0cf.pdf"
  );

  assert.equal(plan.type, "plan");
  assert.equal(plan.action.type, "parse-resume");
  assert.equal(plan.action.inputPath, "C:\\Users\\PC\\Documents\\新建简历 fda0cf.pdf");
});
