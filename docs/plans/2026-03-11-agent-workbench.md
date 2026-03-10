# Agent Workbench TUI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hard-cut the current chat-only Ink interface into a three-pane agent workbench with inline approvals, structured activity events, persistent workbench session state, and in-TUI configuration.

**Architecture:** Keep the existing `Ink -> chat runtime -> tool adapters -> domain commands -> OpenAI-compatible LLM` layering, but replace the current text-stream contract with a structured event contract shared by runtime, session storage, and the TUI. Remove legacy slash-driven approval flow and promote approval cards, task state, and details panels to first-class state.

**Tech Stack:** TypeScript, Ink, React, node:test, existing mock OpenAI server scripts, current `runParse` / `runOptimize` command adapters

---

### Task 1: Upgrade persistent session schema for workbench state

**Files:**
- Modify: `src/chat/session.ts`
- Test: `tests/chat-persistence.test.mjs`

**Step 1: Write the failing test**

Add assertions that a saved session persists:

```js
assert.deepEqual(saved.meta.cwd, "/tmp/project");
assert.equal(saved.tasks.length, 1);
assert.equal(saved.pendingApproval.title, "优化当前简历");
assert.equal(saved.composerDraft, "帮我补量化结果");
```

Also add a normalization case that loads an old minimal session object and fills new defaults:

```js
assert.deepEqual(reloaded.tasks, []);
assert.equal(reloaded.selection.detailsTab, "plan");
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-persistence.test.mjs
```

Expected: FAIL because `meta`, `tasks`, `pendingApproval`, `selection`, or `composerDraft` are missing.

**Step 3: Write minimal implementation**

In `src/chat/session.ts`, replace the current flat session normalizer with a workbench normalizer that always returns:

```ts
{
  meta: { id, title, createdAt, updatedAt, cwd },
  transcript: [],
  tasks: [],
  pendingApproval: undefined,
  contextRefs: [],
  artifacts: {},
  selection: { pane: "transcript", entityId: "", detailsTab: "plan" },
  composerDraft: ""
}
```

Keep `active.json` and `sessions/*.json` storage locations unchanged.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-persistence.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/session.ts tests/chat-persistence.test.mjs
git commit -m "refactor: upgrade chat session schema for workbench"
```

---

### Task 2: Introduce structured chat events and remove text-only runtime IO

**Files:**
- Create: `src/chat/events.ts`
- Modify: `src/chat/runtime.ts`
- Modify: `src/chat/agent.ts`
- Test: `tests/chat-runtime.test.mjs`
- Test: `tests/chat-loop.test.mjs`
- Test: `tests/chat-agent.test.mjs`

**Step 1: Write the failing test**

Add runtime assertions that submitted input emits semantic events instead of only strings:

```js
assert.equal(events[0].type, "user_message");
assert.equal(events[1].type, "plan_proposed");
assert.equal(events[2].type, "approval_requested");
```

For tool execution:

```js
assert.equal(events.some((e) => e.type === "task_started"), true);
assert.equal(events.some((e) => e.type === "task_finished"), true);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-runtime.test.mjs tests/chat-loop.test.mjs tests/chat-agent.test.mjs
```

Expected: FAIL because runtime still writes plain strings and agent still stores `pendingPlan`.

**Step 3: Write minimal implementation**

Create `src/chat/events.ts` with the shared event shapes:

```ts
export type ChatEvent =
  | { type: "user_message"; id: string; content: string }
  | { type: "plan_proposed"; id: string; summary: string }
  | { type: "approval_requested"; id: string; title: string; summary: string }
  | { type: "task_started"; id: string; taskId: string; label: string }
  | { type: "task_finished"; id: string; taskId: string; status: "done" | "error" }
  | { type: "error"; id: string; message: string };
```

Then:

1. Replace `pendingPlan` with `pendingApproval`.
2. Replace `io.write` / `io.writeChunk` usage in `runtime.ts` with an `emit(event)` contract.
3. Make `agent.ts` append transcript items and task state from tool lifecycle instead of appending assistant text like `计划：...`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-runtime.test.mjs tests/chat-loop.test.mjs tests/chat-agent.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/events.ts src/chat/runtime.ts src/chat/agent.ts tests/chat-runtime.test.mjs tests/chat-loop.test.mjs tests/chat-agent.test.mjs
git commit -m "refactor: convert chat runtime to structured events"
```

---

### Task 3: Hard-cut approval flow and task/artifact patches

**Files:**
- Modify: `src/chat/tools.ts`
- Modify: `src/chat/planner.ts`
- Modify: `src/chat/agent.ts`
- Test: `tests/chat-agent.test.mjs`
- Test: `tests/chat-planner.test.mjs`

**Step 1: Write the failing test**

Add assertions that planner-generated tool work produces approval cards and task records:

```js
assert.equal(awaiting.pendingApproval.title, "优化当前简历");
assert.equal(awaiting.tasks[0].status, "waiting_approval");
```

After execution:

```js
assert.equal(finished.tasks.at(-1).status, "done");
assert.ok(finished.artifacts.latestModelPath);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-agent.test.mjs tests/chat-planner.test.mjs
```

Expected: FAIL because tool results only update `sessionPatch` and planner does not drive approval/task metadata.

**Step 3: Write minimal implementation**

In `src/chat/tools.ts`, return:

```ts
{
  sessionPatch: { currentResume, currentJd },
  artifactPatch: { latestModelPath: outputPath },
  taskPatch: { label: "optimize-resume", status: "done" },
  phaseB
}
```

In `src/chat/agent.ts`:

1. Create a task entry on `plan`.
2. Move it to `running` on approval.
3. Move it to `done` or `error` after tool completion.
4. Preserve Phase B gating with `waiting_phase_b_feedback`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-agent.test.mjs tests/chat-planner.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/tools.ts src/chat/planner.ts src/chat/agent.ts tests/chat-agent.test.mjs tests/chat-planner.test.mjs
git commit -m "refactor: add task and approval state to tool flow"
```

---

### Task 4: Replace legacy slash commands with workbench command set

**Files:**
- Modify: `src/chat/slash.ts`
- Modify: `src/chat/runtime.ts`
- Test: `tests/chat-slash.test.mjs`

**Step 1: Write the failing test**

Delete assertions for `/save`, `/load`, `/go`, `/cancel`, `/clear`, then add:

```js
assert.equal(result.command.type, "open_config");
assert.equal(result.command.type, "new_session");
assert.throws(() => executeSlashCommand(runtime, "/go"), /unsupported slash command/);
```

Add config persistence coverage:

```js
assert.equal(runtime.config.model, "gpt-4.1-mini");
assert.equal(runtime.config.baseUrl, "http://127.0.0.1:11434/v1");
assert.equal(runtime.config.apiKey, "local-key");
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-slash.test.mjs
```

Expected: FAIL because legacy commands still exist and `/config` still returns JSON text.

**Step 3: Write minimal implementation**

In `src/chat/slash.ts`, support only:

```txt
/help
/new
/resume [session]
/config
/model <id>
/baseurl <url>
/key <token>
/template <name>
/quit
```

Behavior:

1. `/config` opens config details view.
2. `/new` resets transcript/tasks/pending approval and creates a fresh session object.
3. `/resume` loads an existing session into current runtime.
4. `/model`, `/baseurl`, `/key` persist to `ai.env`.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-slash.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/slash.ts src/chat/runtime.ts tests/chat-slash.test.mjs
git commit -m "refactor: replace legacy slash commands with workbench commands"
```

---

### Task 5: Hard-cut the Ink UI into a three-pane workbench

**Files:**
- Modify: `src/chat/app.tsx`
- Test: `tests/chat-app.test.mjs`

**Step 1: Write the failing test**

Replace the current chat-frame assertions with workbench layout assertions:

```js
assert.match(frame, /Sessions \/ Tasks/);
assert.match(frame, /Transcript \/ Activity/);
assert.match(frame, /Details/);
assert.match(frame, /branch:/);
```

Add approval-card coverage:

```js
assert.match(frame, /Approval Required/);
assert.match(frame, /批准/);
assert.match(frame, /拒绝/);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-app.test.mjs
```

Expected: FAIL because current UI still renders a simple bordered transcript and prompt row.

**Step 3: Write minimal implementation**

In `src/chat/app.tsx`:

1. Replace the single transcript box with left/center/right panes.
2. Read tasks, transcript, pending approval, config view, and selection from runtime session.
3. Render a fixed bottom composer and status line.
4. Render approval cards inline in the center pane and details in the right rail.
5. Keep `assistant_delta` rendering in center pane only; do not persist it.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-app.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/app.tsx tests/chat-app.test.mjs
git commit -m "feat: replace chat ui with agent workbench tui"
```

---

### Task 6: Add first-class `!command` activity execution

**Files:**
- Modify: `src/chat/runtime.ts`
- Modify: `src/chat/app.tsx`
- Add or Modify: `tests/chat-runtime.test.mjs`
- Add or Modify: `tests/chat-app.test.mjs`

**Step 1: Write the failing test**

Add runtime coverage for shell-style input:

```js
const result = await submitChatInput(runtime, "!pwd", io, handlers);
assert.equal(events.some((e) => e.type === "task_started"), true);
assert.equal(events.some((e) => e.type === "task_finished"), true);
```

Add UI assertion:

```js
assert.match(frame, /shell/);
assert.match(frame, /pwd/);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npm run build && node --test tests/chat-runtime.test.mjs tests/chat-app.test.mjs
```

Expected: FAIL because `!` input is currently treated as ordinary chat text.

**Step 3: Write minimal implementation**

In `src/chat/runtime.ts`, detect `!` prefix:

1. Spawn a local shell command with `child_process.spawn`.
2. Emit `task_started`, `task_progress`, and `task_finished` events.
3. Store the command result as an activity transcript item.
4. Surface non-zero exit as an `error` event.

Do not add an embedded PTY pane in this task; keep shell execution one-shot and transcripted.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build && node --test tests/chat-runtime.test.mjs tests/chat-app.test.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/runtime.ts src/chat/app.tsx tests/chat-runtime.test.mjs tests/chat-app.test.mjs
git commit -m "feat: add shell activity input to workbench"
```

---

### Task 7: Update end-to-end coverage and final regression commands

**Files:**
- Modify: `scripts/test-chat-mock.sh`
- Modify: `tests/chat-mode-test-cases.md`
- Test: `tests/chat-unit` suite

**Step 1: Write the failing test**

Update the mock chat script assertions to look for workbench labels and inline approval behavior instead of `/go` prompts:

```bash
grep -q "Sessions / Tasks" "$OUTPUT_FILE"
grep -q "Approval Required" "$OUTPUT_FILE"
```

Update the test case document to remove `/go`, `/cancel`, `/save`, and `/load` expectations.

**Step 2: Run test to verify it fails**

Run:

```bash
npm run test:chat-mock
```

Expected: FAIL because the mock flow still expects the old chat shell behavior.

**Step 3: Write minimal implementation**

1. Update `scripts/test-chat-mock.sh` to feed approval-key flows instead of slash approvals.
2. Update `tests/chat-mode-test-cases.md` to match the workbench acceptance contract.
3. Adjust any brittle output matching to the new pane layout.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run typecheck
npm run test:chat-unit
npm run test:chat-mock
npm run test:llm-unit
npm run test:ai-mock
npm test
```

Expected: PASS for all commands.

**Step 5: Commit**

```bash
git add scripts/test-chat-mock.sh tests/chat-mode-test-cases.md
git commit -m "test: align chat regression coverage with workbench tui"
```

---

## Definition of Done

The feature is complete only when all of the following are true:

1. `cn-resume` launches into the workbench TUI by default.
2. The UI has left rail, center transcript/activity, right details rail, fixed composer, and status line.
3. Inline approvals replace `/go` and `/cancel`.
4. Workbench session state persists and resumes correctly.
5. `/config`, `/model`, `/baseurl`, `/key`, `/resume`, `/new`, `/template`, `/quit` all work.
6. `!command` is handled as activity, not chat text.
7. Parse / optimize / Phase B workflows still function.
8. Typecheck and all chat-related tests pass.

---

Plan complete and saved to `docs/plans/2026-03-11-agent-workbench.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
