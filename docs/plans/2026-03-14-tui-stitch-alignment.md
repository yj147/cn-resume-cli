# TUI Stitch Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前 Chat TUI 硬切到 `stitch/code.html` 与 `stitch/screen.png` 对齐的终端工作台外观，并让批准后的像素品牌字标常驻在主框顶端、去掉下方字幕，同时清除 `<think>` 泄露。

**Architecture:** 保留现有 runtime / session / tool 闭环，只重做展示层骨架。`src/tui/run.tsx` 负责终端 chrome 与左右双栏布局；`src/tui/transcript/*`、`src/tui/composer/*`、`src/tui/drawer/*` 负责局部视觉；`src/chat/answer.ts` 与 `src/tui/view-model.ts` 共同拦截 provider 噪音。

> **CSV 真相修正：** 右侧 preview 默认关闭，仅在 `resumeDraft / pendingPatches / phaseB.status=awaiting_feedback` 的编辑闭环内自动打开；`[WARN]/[INFO]` 等杂日志不进入 transcript 主轴。

**Tech Stack:** TypeScript, Ink, ink-testing-library, Node test runner

---

### Task 1: 锁定视觉真相冲突与测试入口

**Files:**
- Modify: `tests/tui-run.test.mjs`
- Modify: `tests/tui-preview-drawer.test.mjs`
- Modify: `tests/chat-answer.test.mjs`

**Step 1: Write the failing tests**

- 断言主界面常驻批准后的像素品牌字标，且不再渲染字标下方的小号 `CN-RESUME` 字幕
- 断言右侧 preview pane 默认关闭，进入编辑态自动打开
- 断言 `<think>...</think>` 不进入最终 assistant 文本

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/tui-run.test.mjs tests/tui-preview-drawer.test.mjs tests/chat-answer.test.mjs`

Expected: FAIL，因为当前品牌字标会一闪而过且漂在主框外、preview 默认关闭，且 `<think>` 未过滤。

### Task 2: 重做 TUI shell 骨架

**Files:**
- Modify: `src/tui/run.tsx`
- Modify: `src/tui/theme.ts`
- Modify: `src/tui/view-model.ts`

**Step 1: Write minimal implementation**

- 在 `run.tsx` 中把单列布局改成：
  - 顶栏 status bar
  - 中部左右双栏
  - 底部 composer footer
- 顶部主框内常驻像素品牌字标，移除字标下方字幕；状态栏保留紧凑品牌名
- status bar 的 CONTEXT/TIME 必须绑定真实数据：CONTEXT 用 `session.contextRefs` 真值展示，TIME 用实时系统时钟，不允许伪造 token 数或冻结时间
- preview 改为主布局右栏，而不是正文下方抽屉
- `view-model` 保留业务投影，只把 preview 改成由 `pendingPatches / resumeDraft / phaseB` 推导可见性，并补充标题元信息

**Step 2: Run tests**

Run: `npm run build && node --test tests/tui-run.test.mjs tests/tui-view-model.test.mjs tests/tui-brand.test.mjs`

Expected: PASS

### Task 3: 对齐 transcript / composer 视觉细节

**Files:**
- Modify: `src/tui/transcript/assistant-message.tsx`
- Modify: `src/tui/transcript/user-message.tsx`
- Modify: `src/tui/transcript/tool-card.tsx`
- Modify: `src/tui/transcript/status-card.tsx`
- Modify: `src/tui/composer/composer.tsx`
- Modify: `src/tui/drawer/preview-drawer.tsx`
- Modify: `src/tui/drawer/structure-tab.tsx`
- Modify: `src/tui/drawer/template-tab.tsx`
- Test: `tests/tui-transcript-render.test.mjs`
- Test: `tests/tui-composer.test.mjs`
- Test: `tests/tui-preview-drawer.test.mjs`

**Step 1: Write minimal implementation**

- transcript 分块显示，贴近 stitch 的 header + content + diff card 风格
- 主时间线不渲染 `[WARN]/[INFO]` 等杂日志
- composer 使用底栏终端提示样式与常驻光标
- preview pane 用更接近高保真稿的面板标题与内容卡片，但非编辑态不强制渲染

**Step 2: Run tests**

Run: `npm run build && node --test tests/tui-transcript-render.test.mjs tests/tui-composer.test.mjs tests/tui-preview-drawer.test.mjs`

Expected: PASS

### Task 4: 清理 provider 噪音并完成回归

**Files:**
- Modify: `src/chat/answer.ts`
- Modify: `src/tui/view-model.ts`
- Test: `tests/chat-answer.test.mjs`
- Test: `tests/tui-view-model.test.mjs`

**Step 1: Write minimal implementation**

- `sanitizeAssistantText()` 清理 `<think>...</think>` 与残留标签
- `view-model` 再做一层 transcript 噪音兜底，防止旧会话污染 UI，并显式丢弃 `[WARN]/[INFO]` 主轴日志

**Step 2: Run final targeted suite**

Run: `npm run build && node --test tests/chat-answer.test.mjs tests/tui-brand.test.mjs tests/tui-view-model.test.mjs tests/tui-transcript-render.test.mjs tests/tui-composer.test.mjs tests/tui-preview-drawer.test.mjs tests/tui-run.test.mjs`

Expected: PASS

### Task 5: 冻结 stitch golden screenshot

**Files:**
- Create: `tests/tui-stitch-screen-golden.test.mjs`

**Step 1: Write the golden artifact gate**

- 对 `stitch/screen.png` 断言：
  - SHA-256 指纹固定
  - 尺寸固定为 `1600x1280`
  - 顶栏背景、三色控制点、分栏边界、底栏背景等关键像素固定

**Step 2: Run test**

Run: `npm run build && node --test tests/tui-stitch-screen-golden.test.mjs`

Expected: PASS
