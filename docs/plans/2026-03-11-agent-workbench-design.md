# cn-resume Agent Workbench TUI Design

**Status:** Approved  
**Date:** 2026-03-11  
**Scope:** Hard cut current Ink chat UI to a workbench-style agent CLI

---

## 1. Goal

把当前“消息列表 + 状态条 + 输入框”的聊天壳，硬切成类似 OpenCode / Claude Code / Codex 的终端工作台。

目标不是换皮肤，而是把 CLI 从“文本问答器”升级成“可见任务、可见审批、可见上下文、可恢复会话”的 agent 界面。

---

## 2. Current Problem

当前实现已经具备基础对话、计划确认、会话保存和流式输出能力，但底层契约仍是纯文本聊天模型：

1. UI 只有 transcript 与输入框，没有任务区、详情区、审批卡区。
2. runtime 只提供 `write` / `writeChunk` 文本通道，UI 只能把工具和审批伪装成消息。
3. 计划确认仍依赖 `/go` `/cancel` 文本命令，不是内联审批。
4. slash 命令已经承担配置和会话功能，但交互仍是“打印字符串”，不是面板式工作流。

这导致当前 CLI “能聊天”，但不像 agent 工作台。

---

## 3. Final Product Shape

默认执行 `cn-resume` 直接进入全屏 TUI。

```text
┌ cn-resume ─ model:<id> ─ provider:openai-compatible ─ approval:manual ─ session:<id> ─ /config ┐
│ cwd:<path>                                                                                  mode:agent │
├──────────────────────┬──────────────────────────────────────────────────────────────┬──────────────────────────┤
│ Sessions / Tasks     │ Transcript / Activity                                        │ Details                  │
│                      │                                                              │                          │
│ 最近会话             │ 用户消息                                                     │ Plan / Approval /        │
│ 当前任务             │ 助手回复                                                     │ Context / Config /       │
│ 快捷入口             │ 工具活动                                                     │ Artifact                 │
│ /resume /config      │ 错误卡 / 审批卡 / 流式输出                                  │                          │
├──────────────────────┴──────────────────────────────────────────────────────────────┴──────────────────────────┤
│ > composer: 支持普通消息、@文件引用、!命令、/命令                                               Enter发送 Ctrl+J换行 │
├────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ branch:<name> | ctx:<percent> | tokens:<n> | last tool:<name> | warnings:<n>                                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layout Rules

### 4.1 Top Bar

展示稳定的全局信息：

- 产品名
- 当前模型
- provider 类型
- approval 模式
- 当前 session id
- 当前 cwd / mode

### 4.2 Left Rail

左栏固定显示三个块：

1. `Recent Sessions`
2. `Current Tasks`
3. `Quick Actions`

左栏不是聊天内容区，不参与正文滚动。

### 4.3 Center Pane

中栏只展示时间顺序活动流：

- 用户消息
- 助手回复
- tool 启动/进度/完成
- 审批请求
- 错误

普通聊天文本和工具活动共享同一时间线，但视觉样式不同。

### 4.4 Right Rail

右栏是“当前选中对象详情”，不另开子窗口。

右栏可切换显示：

- 当前计划
- 当前待审批卡
- 当前上下文引用
- 当前配置
- 最近产物

### 4.5 Bottom Composer

输入区固定在底部，永远可见。

支持：

- 普通消息
- `@path`
- `!command`
- `/command`
- 多行输入

---

## 5. Interaction Model

### 5.1 Input Semantics

- 普通文本：发送给 planner / answer
- `@`：插入文件或产物引用
- `!`：执行本地 shell 命令，并把结果作为 activity 卡片写入时间线
- `/`：执行内置命令

### 5.2 Keyboard

- `Enter`：发送 / 批准当前审批
- `Ctrl+J`：换行
- `Esc`：拒绝当前审批，或退出当前面板焦点
- `Tab`：展开或切换右栏详情
- `Up/Down`：历史输入

### 5.3 Approval

删除 `/go` `/cancel` 文本审批。

所有需要执行工具的计划都以 `Approval Card` 形式展示，包含：

- `title`
- `summary`
- `details`
- `affectedArtifacts`
- `confirmLabel`
- `rejectLabel`

审批操作通过键盘完成，而不是通过输入一条命令完成。

---

## 6. Structured Event Protocol

UI 不再直接消费 `write` / `writeChunk`。

runtime 改成发送结构化事件：

- `user_message`
- `assistant_started`
- `assistant_delta`
- `assistant_completed`
- `plan_proposed`
- `approval_requested`
- `approval_resolved`
- `task_started`
- `task_progress`
- `task_finished`
- `config_changed`
- `session_resumed`
- `error`

规则：

1. `assistant_delta` 只用于渲染流式内容，不持久化。
2. 持久化只存完成态消息和业务态事件。
3. 工具输出不能再退化成普通 notice 文本。
4. 错误必须显式进入事件流，不能吞掉。

---

## 7. Session Model

会话持久化只存工作状态，不存渲染噪音。

建议结构：

```ts
{
  meta: {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    cwd: string;
  };
  transcript: Array<TranscriptItem>;
  tasks: Array<TaskItem>;
  pendingApproval?: ApprovalCard;
  contextRefs: Array<ContextRef>;
  artifacts: Record<string, string>;
  selection: {
    pane: "sessions" | "transcript" | "details";
    entityId: string;
    detailsTab: "plan" | "approval" | "context" | "config" | "artifact";
  };
  composerDraft: string;
  configView?: {
    mode: "closed" | "open";
  };
}
```

### Must Persist

- 已完成 transcript
- task 状态
- 待审批对象
- 当前 context 引用
- 产物路径
- 未发送草稿

### Must Not Persist

- token 级流式 delta
- 临时 notice
- 终端尺寸
- 主题渲染状态

---

## 8. State Machine

运行态收敛为：

- `idle`
- `planning`
- `waiting_approval`
- `running_tool`
- `waiting_phase_b_feedback`
- `error`

规则：

1. planner 产出 tool plan 时，进入 `waiting_approval`
2. 用户批准后，进入 `running_tool`
3. `optimize-resume` 返回 Phase B 时，进入 `waiting_phase_b_feedback`
4. 反馈确认完成后回到 `idle`
5. 任一步失败进入 `error`，并写入 error event

---

## 9. Slash Commands

最终保留的 slash 命令集：

- `/help`
- `/new`
- `/resume [session]`
- `/config`
- `/model <id>`
- `/baseurl <url>`
- `/key <token>`
- `/template <name>`
- `/quit`

删除：

- `/go`
- `/cancel`
- `/save`
- `/load`
- `/clear` 作为独立语义，合并进 `/new`

说明：

1. `/config` 不再打印 JSON，而是打开右栏配置视图。
2. `/model` `/baseurl` `/key` 仍保留为快速配置入口。
3. 配置继续明文持久化到本地 `ai.env`。

---

## 10. Tool and Planner Contract

planner 继续保留“回答 or 计划”两分支：

- `answer`
- `plan`

tool adapter 继续复用现有 parse / optimize 领域函数，但返回值升级为：

- `sessionPatch`
- `taskPatch`
- `artifactPatch`
- `phaseB`

这样做的目的，是让 runtime 可以同时更新：

- transcript
- tasks
- details
- artifacts

而不是只更新 `currentResume`。

---

## 11. Non-Goals

这次改造明确不做：

1. 多 provider 原生协议
2. 自动摘要压缩
3. 通用 agent framework
4. 花哨主题系统
5. 工具输出 fallback 成普通文本

`!` 命令需要成为一等输入入口，但本次目标是把命令结果纳入 activity 流；不要求实现独立的全屏交互式 PTY 子终端。

---

## 12. Migration Order

按这个顺序硬切：

1. `session.ts`：升级会话结构
2. `agent.ts` + `runtime.ts`：切结构化事件与审批状态机
3. `planner.ts` + `tools.ts`：补 task / artifact patch
4. `slash.ts`：删除旧命令，切新命令集
5. `app.tsx`：替换为工作台布局
6. 测试：更新 persistence / runtime / agent / slash / app / mock E2E

中途不保留双轨 UI。

---

## 13. Acceptance Criteria

以下全部满足才算完成：

1. `cn-resume` 默认进入全屏工作台 TUI
2. 左栏 / 中栏 / 右栏 / composer / statusline 全部落地
3. `/go` `/cancel` 完全删除，审批改为 inline approval card
4. `@` / `!` / `/` 都在 composer 内工作
5. 会话能恢复 transcript、tasks、pending approval、composer draft
6. 配置可在 TUI 内修改，并明文持久化
7. 现有 parse / optimize 工作流继续可用
8. Phase B 反馈仍然被强制门控
9. 测试覆盖新的状态流和交互流

---

## 14. References

- OpenCode TUI: https://opencode.ai/docs/tui/
- Claude Code Interactive Mode: https://docs.anthropic.com/en/docs/claude-code/interactive-mode
- Codex CLI Features: https://developers.openai.com/codex/cli/features/
- Gemini CLI interactive shell note: https://developers.googleblog.com/say-hello-to-a-new-level-of-interactivity-in-gemini-cli/
