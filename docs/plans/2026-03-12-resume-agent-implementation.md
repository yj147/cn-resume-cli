# Resume Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把现有 cn-resume CLI 重构为统一内容模型、统一控制器、统一模板真相的生产级简历 agent，同时保留 50 模板产品面与现有 CLI 能力。

**Architecture:** 先冻结单一内容真相层，再接控制器状态机与审核链，最后把模板/分页/导出收口到统一 `ResumeDocument IR + TemplateSpec`。全程采用硬切，不保留内部兼容层，不新增双路径。

**Tech Stack:** TypeScript、现有 CLI 命令体系、现有 render-engine 渲染器、node:test、Playwright/PDF 渲染链

## Status Update — 2026-03-13

- `issues.csv` 已成为唯一任务台账；原计划的 12 个粗粒度任务已拆解并映射到 `issues.csv:1-27`
- 计划外但已完成的补充任务已补入 `issues.csv:28-35`
  - 功能性 E2E 用例文档与 QA loop
  - 自定义内容简历 E2E 与产物回归
  - 纯 CLI `prepare-export` 闭环
  - PDF/视觉截图回归与 smoke 稳定化
- 最终设计对齐收口任务 `36-40` 已全部闭环：
  - `0-1 authoring` 真入口
  - patch 接受/拒绝用户入口 + controller 闭环
  - 单一状态真相 + stable checkpoint 自动写入
  - `paginateDocument` 接入 layout 主链
  - 架构师复审闭环
- **当前状态已达到 DoD**：设计、实现、`issues.csv`、QA 文档与架构复审结论一致，可宣称“设计与实现完全对齐”
- **最终验证命令**：
  - `npm run build && node --test tests/pagination.test.mjs tests/chat-agent.test.mjs tests/chat-loop.test.mjs tests/resume-agent-e2e.test.mjs tests/prepare-export-cli.test.mjs`
  - `npm run build && npm test`

---

### Task 1: 冻结 Canonical Resume Model 与字段来源模型

**Files:**
- Modify: `src/core/model.ts`
- Create: `src/core/provenance.ts`
- Test: `tests/model-normalization.test.mjs`

**Step 1: Write the failing test**

新增测试，断言统一模型包含：

- 字段值
- 字段来源
- 字段状态
- 更新时间

同时覆盖：

- parse-first 输入
- 0-1 authoring 输入
- 未确认候选字段不会被标记为 confirmed

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/model-normalization.test.mjs`

Expected: FAIL，因为当前 `src/core/model.ts` 只有值层，没有来源/确认状态层。

**Step 3: Write minimal implementation**

1. 在 `src/core/model.ts` 中拆出值层与字段 envelope
2. 新建 `src/core/provenance.ts` 管理来源、状态、更新时间枚举与 helper
3. 让现有 `normalizeReactiveJson` 输出冻结后的 canonical shape

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/model-normalization.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/model.ts src/core/provenance.ts tests/model-normalization.test.mjs
git commit -m "refactor: add canonical resume provenance model"
```

### Task 2: 增加 ResumeDraft 与模块级 patch 协议

**Files:**
- Create: `src/core/patches.ts`
- Modify: `src/chat/agent.ts`
- Modify: `src/chat/tools.ts`
- Test: `tests/chat-agent.test.mjs`

**Step 1: Write the failing test**

新增测试，断言：

- parse / authoring 只产出 `ResumeDraft`
- 未确认字段进入 `pending patches`
- patch 粒度为模块级，不是整份全量覆盖

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/chat-agent.test.mjs`

Expected: FAIL，因为当前 chat tool 直接写 `currentResume.model`。

**Step 3: Write minimal implementation**

1. 新增 patch 结构：模块名、旧值、新值、来源、严重级
2. `src/chat/tools.ts` 返回 draft patch，而不是直接升级正式事实
3. `src/chat/agent.ts` 接管 patch 队列与确认状态

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/chat-agent.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/patches.ts src/chat/agent.ts src/chat/tools.ts tests/chat-agent.test.mjs
git commit -m "refactor: add module patch workflow to chat agent"
```

### Task 3: 落地控制器状态机与 checkpoint 持久化

**Files:**
- Create: `src/chat/controller.ts`
- Modify: `src/chat/session.ts`
- Modify: `src/chat/runtime.ts`
- Test: `tests/chat-runtime.test.mjs`
- Test: `tests/chat-persistence.test.mjs`

**Step 1: Write the failing test**

断言控制器能够显式进入：

- `pending_confirmation`
- `reviewing`
- `layout_solving`
- `ready_to_export`

并且 session 能恢复：

- 当前状态
- 当前 canonical model（含 provenance / confirmation 状态）
- pending patches
- 最近审核结果
- 最近分页结果
- 当前模板选择
- 导出 artifacts / 模板对比 artifacts

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/chat-runtime.test.mjs tests/chat-persistence.test.mjs`

Expected: FAIL，因为当前 runtime/session 还没有完整状态机和 checkpoint 模型。

**Step 3: Write minimal implementation**

1. 新建 `src/chat/controller.ts`，集中处理状态转移
2. `src/chat/runtime.ts` 只分发事件，不私自改状态
3. `src/chat/session.ts` 持久化 workflow state、current resume、patch 队列、审核结果、分页结果、模板选择与 artifacts
4. 在解析完成、patch 生成/确认、审核完成、模板确认、分页求解完成、导出完成处写入 stable checkpoint

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/chat-runtime.test.mjs tests/chat-persistence.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/chat/controller.ts src/chat/session.ts src/chat/runtime.ts tests/chat-runtime.test.mjs tests/chat-persistence.test.mjs
git commit -m "feat: add resume agent controller state machine"
```

### Task 4: 把 CLI 审核链收口为统一 review service

**Files:**
- Create: `src/eval/review-service.ts`
- Modify: `src/commands.ts`
- Modify: `src/eval/evaluation.ts`
- Modify: `src/chat/tools.ts`
- Test: `tests/review-service.test.mjs`

**Step 1: Write the failing test**

断言同一个 review service 可同时供：

- CLI `validate`
- CLI `analyze-jd`
- CLI `grammar-check`
- chat `/review`

使用，并输出统一的 blocker / warning / suggestion 结果。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/review-service.test.mjs`

Expected: FAIL，因为当前 CLI 与 chat 没有统一服务层。

**Step 3: Write minimal implementation**

1. 抽出 `src/eval/review-service.ts`
2. `src/commands.ts` 改走 service
3. `src/chat/tools.ts` 挂接同一 service
4. 保留现有 rule/AI 评估实现，但统一输出协议

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/review-service.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/eval/review-service.ts src/commands.ts src/eval/evaluation.ts src/chat/tools.ts tests/review-service.test.mjs
git commit -m "refactor: unify cli and chat review pipeline"
```

### Task 5: 定义 ResumeDocument IR

**Files:**
- Create: `src/layout-core/document-ir.ts`
- Modify: `src/render-engine/adapter.ts`
- Test: `tests/document-ir.test.mjs`

**Step 1: Write the failing test**

断言 canonical model 能被稳定转换为：

- section blocks
- block hierarchy
- emphasis metadata
- split / keepTogether 约束

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/document-ir.test.mjs`

Expected: FAIL，因为当前 adapter 直接输出 render-engine sections，没有独立 IR。

**Step 3: Write minimal implementation**

1. 新建 `src/layout-core/document-ir.ts`
2. 在 `src/render-engine/adapter.ts` 前增加 canonical -> IR 转换
3. 把现有 section 适配逻辑收口到 IR builder

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/document-ir.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/layout-core/document-ir.ts src/render-engine/adapter.ts tests/document-ir.test.mjs
git commit -m "feat: introduce resume document ir"
```

### Task 6: 定义 TemplateSpec，保留 50 模板产品面

**Files:**
- Create: `src/template/spec.ts`
- Modify: `src/constants.ts`
- Modify: `src/template/custom-template.ts`
- Test: `tests/template-spec.test.mjs`

**Step 1: Write the failing test**

断言每个模板名都可解析为：

- `TemplateIntent`
- layout family
- section recipes
- visual tokens
- pagination policy
- `thumbnail recipe`
- `template overrides`

并且模板别名与自定义导入仍然受支持。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/template-spec.test.mjs`

Expected: FAIL，因为当前模板主要是平铺名单 + 样式常量。

**Step 3: Write minimal implementation**

1. 新建 `src/template/spec.ts`
2. 把 `src/constants.ts` 中的模板清单提升为模板 registry
3. 在 `TemplateSpec` 中冻结 `TemplateIntent`、`ThumbnailRecipe`、`TemplateOverrides`
4. `src/template/custom-template.ts` 改为先解析 `TemplateSpec`，再决定 builtin / import

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/template-spec.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/template/spec.ts src/constants.ts src/template/custom-template.ts tests/template-spec.test.mjs
git commit -m "refactor: add template spec registry"
```

### Task 7: 把 render-engine preview / PDF builder 收口到统一模板真相

**Files:**
- Modify: `src/render-engine/builders.ts`
- Create: `src/layout-core/render-tree.ts`
- Test: `tests/jadeai-render-config.test.mjs`
- Test: `tests/render-tree.test.mjs`

**Step 1: Write the failing test**

断言 preview / pdf 渲染读取的是同一模板规范和同一文档结构，而不是各自硬编码模板入口。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/jadeai-render-config.test.mjs tests/render-tree.test.mjs`

Expected: FAIL，因为当前 `src/render-engine/builders.ts` 仍是 builder 平铺映射。

**Step 3: Write minimal implementation**

1. 新建 `src/layout-core/render-tree.ts`
2. `src/render-engine/builders.ts` 改为 `IR + TemplateSpec -> render tree -> html`
3. 保留 50 模板名，但删除内部双真相桥接逻辑

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/jadeai-render-config.test.mjs tests/render-tree.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/render-engine/builders.ts src/layout-core/render-tree.ts tests/jadeai-render-config.test.mjs tests/render-tree.test.mjs
git commit -m "refactor: unify jade render pipeline around render tree"
```

### Task 8: 增加分页求解器与超页决策协议

**Files:**
- Create: `src/layout-core/pagination.ts`
- Modify: `src/flows/render.ts`
- Modify: `src/chat/agent.ts`
- Test: `tests/pagination.test.mjs`

**Step 1: Write the failing test**

覆盖：

- 单页正常落版
- 内容超页
- 双栏模板跨页
- 深色侧栏模板跨页背景

并断言超页时不会静默删内容，而是产出显式决策状态。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/pagination.test.mjs`

Expected: FAIL，因为当前没有独立分页求解器。

**Step 3: Write minimal implementation**

1. 新建 `src/layout-core/pagination.ts`
2. 在 `src/flows/render.ts` 接入分页求解结果
3. 在 `src/chat/agent.ts` 中把 `LAYOUT_OVERFLOW` 升级为用户可确认事件

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/pagination.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/layout-core/pagination.ts src/flows/render.ts src/chat/agent.ts tests/pagination.test.mjs
git commit -m "feat: add pagination solver and overflow gating"
```

### Task 9: 落地模板推荐与 A/B 预览协议

**Files:**
- Create: `src/template/recommend.ts`
- Modify: `src/chat/tools.ts`
- Modify: `src/chat/runtime.ts`
- Test: `tests/template-recommend.test.mjs`

**Step 1: Write the failing test**

断言系统会基于：

- 内容密度
- 岗位目标
- 用户偏好词
- 页数目标
- ATS 偏好

给出 3 个模板候选及推荐理由。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/template-recommend.test.mjs`

Expected: FAIL，因为当前没有推荐层。

**Step 3: Write minimal implementation**

1. 新建 `src/template/recommend.ts`
2. 在 `src/chat/tools.ts` 中提供推荐接口
3. 在 `src/chat/runtime.ts` 中允许基于真实内容做候选预览

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/template-recommend.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/template/recommend.ts src/chat/tools.ts src/chat/runtime.ts tests/template-recommend.test.mjs
git commit -m "feat: add template recommendation workflow"
```

### Task 10: 全链路回归与导出门禁

**Files:**
- Modify: `src/export-gate.ts`
- Modify: `scripts/smoke.sh`
- Create: `tests/resume-agent-e2e.test.mjs`
- Modify: `tests/chat-loop.test.mjs`

**Step 1: Write the failing test**

增加端到端覆盖：

- parse-first -> patch confirmation -> review -> template recommendation -> export
- 0-1 authoring -> patch confirmation -> review -> multipage approval -> export

并断言：

- 未确认事实不能导出
- blocker 审核问题不能导出
- 未选模板不能导出
- 缺 layout result 不能导出
- 多页未确认不能导出

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs`

Expected: FAIL，因为当前没有完整 gate。

**Step 3: Write minimal implementation**

1. 补齐 `src/export-gate.ts` 导出前 gate
2. 调整 `scripts/smoke.sh` 覆盖新的闭环
3. 确保 CLI 与 chat 侧对导出门禁口径一致

**Step 4: Run test to verify it passes**

Run:

```bash
npm run typecheck
npm run build
node --test tests/model-normalization.test.mjs tests/document-ir.test.mjs tests/template-spec.test.mjs tests/pagination.test.mjs tests/template-recommend.test.mjs tests/review-service.test.mjs tests/resume-agent-e2e.test.mjs
npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/export-gate.ts scripts/smoke.sh tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs
git commit -m "test: add resume agent end-to-end regression gates"
```

---

### Task 11: 接通 thumbnail 渲染主链

**Files:**
- Create: `src/template/thumbnail.ts`
- Modify: `src/layout-core/render-tree.ts`
- Modify: `src/template/custom-template.ts`
- Test: `tests/template-thumbnail.test.mjs`

**Step 1: Write the failing test**

断言 thumbnail 渲染读取的仍是同一 `RenderTree + TemplateSpec`，并且：

- 不再独立 hardcode section order / visual tokens
- 模板切换会同步影响 preview / PDF / thumbnail
- 同一份真实内容在三种渲染入口中的 section 可见性一致

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/template-thumbnail.test.mjs`

Expected: FAIL，因为当前只有 preview / PDF 主链，没有 thumbnail 入口验收。

**Step 3: Write minimal implementation**

1. 新建 `src/template/thumbnail.ts`，只接受统一 render inputs
2. `src/template/custom-template.ts` 暴露 preview / PDF / thumbnail 共用渲染入口
3. `src/layout-core/render-tree.ts` 补充 thumbnail 所需 metadata，不新增第二套模板真相

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/template-thumbnail.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/template/thumbnail.ts src/layout-core/render-tree.ts src/template/custom-template.ts tests/template-thumbnail.test.mjs
git commit -m "feat: route thumbnail rendering through shared render tree"
```

### Task 12: 把模板与分页稳定性纳入导出 gate

**Files:**
- Modify: `src/export-gate.ts`
- Modify: `src/flows/render.ts`
- Modify: `src/chat/runtime.ts`
- Modify: `tests/resume-agent-e2e.test.mjs`
- Modify: `tests/chat-loop.test.mjs`

**Step 1: Write the failing test**

断言下列任一状态存在时导出仍被阻断：

- 模板虽已选择但未明确确认
- layout 求解结果缺少稳定标记
- 更换模板后旧 layout result 失效

只有模板与分页结果都稳定后，系统才能进入 `ready_to_export` / `export`。

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs`

Expected: FAIL，因为当前 gate 只检查模板已选中和 layout result 存在，没有显式稳定性合同。

**Step 3: Write minimal implementation**

1. 在 `src/flows/render.ts` 中显式编码 layout stability 合同，并在模板或布局输入变化时使旧结果失效
2. 在 `src/chat/runtime.ts` 中把模板切换与分页结果失效联动到 workflow gate
3. 在 `src/export-gate.ts` 中同时要求模板确认与 layout stability 满足后才能导出

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/export-gate.ts src/flows/render.ts src/chat/runtime.ts tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs
git commit -m "feat: gate export on template and layout stability"
```

---

## Definition of Done

只有当以下条件全部满足，此计划才算完成：

1. parse-first 与 0-1 authoring 进入统一 canonical model
2. 字段来源与确认状态成为正式事实约束
3. 控制器状态机与 checkpoint 可恢复
4. CLI 与 chat 共用 review service
5. preview / PDF / thumbnail 共用 `ResumeDocument IR + TemplateSpec` 单一模板真相
6. 分页求解器控制超页行为
7. 模板推荐默认给出 3 个候选与理由
8. 导出前 gate 能阻断未确认事实、review blocker、未选模板与未确认多页
9. 模板与分页稳定性成为显式导出前提
10. typecheck、build、关键回归测试通过

---
