# Render Engine Hard-Cut Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 以一次发布的硬切方式移除 `JadeAI` 品牌与实现命名，重建公开模板目录，并在不保留兼容层的前提下保持当前渲染输出尽量等价。

**Architecture:** 保持 `layout-core` 只负责 IR / pagination / render tree，把当前 `src/jadeai/*` 重命名为新的 `src/render-engine/*`。随后重写模板公开目录与默认模板，再统一更新 CLI / docs / tests，最后删掉所有 `JadeAI` 残留引用。

**Tech Stack:** TypeScript、现有 CLI 命令体系、现有 HTML/PDF 渲染链、node:test、Puppeteer、现有 visual regression 测试

---

## Dirty Branch Extraction Ledger

本计划不直接 merge `feature/issue-loop-20260312-152941`，只抽离其中可验证、与本轮目标一致的资产。

### 本轮直接吸纳

1. **去品牌文案**
   - 吸纳点：帮助文案从 `JadeAI taxonomy` 改为中性 catalog 描述
   - 落点任务：Task 4
2. **渲染引擎中性命名**
   - 吸纳点：把 `jadeai` 目录与 import 路径硬切为我们自己的引擎命名
   - 落点任务：Task 2、Task 3
3. **模板硬切测试资产**
   - 吸纳点：围绕模板目录替换、默认模板替换、错误语义替换的测试思路
   - 落点任务：Task 1、Task 5、Task 7

### 记录为后续候选，不并入本轮

1. **`currentGoal` session seam**
2. **planner `nextSteps` 只读输出**
3. **bounded autochain**
4. **工具级 `transient / permanent / user-fixable` 错误分类与有限重试**

这些点有价值，但主落点在 chat 控制面，不应和本轮 render-engine 硬切混做。若要吸纳，必须在当前 `workflowState + controller` 架构上重写，不能直接回灌旧 `workflow.stage` 代码。

### 明确排除

1. 旧 `workflow.stage` 控制面实现
2. 旧 planner / autochain / retry 代码整体 cherry-pick
3. 脏分支中未完成的 `layout-core` 替代 `src/jadeai/*` 方案
4. 脏分支里的整套公开模板名直接复用

---

### Task 0: 先封存并冻结 `issue-loop` 脏分支

**Files:**
- No code changes in `main`
- Affects worktree: `.worktrees/feature/issue-loop-20260312-152941`

**Step 1: Verify dirty worktree state**

Run:

```bash
git -C .worktrees/feature/issue-loop-20260312-152941 status --short --branch
```

Expected: 显示大量未提交改动；确认该 worktree 仍是脏状态。

**Step 2: Create snapshot branch in the dirty worktree**

Run:

```bash
git -C .worktrees/feature/issue-loop-20260312-152941 switch -c snapshot/issue-loop-pre-render-engine-hard-cut-20260314
```

Expected: 成功切到新的 snapshot 分支，不影响 `main`。

**Step 3: Commit the dirty snapshot as-is**

Run:

```bash
git -C .worktrees/feature/issue-loop-20260312-152941 add -A
git -C .worktrees/feature/issue-loop-20260312-152941 commit -m "chore: snapshot issue-loop dirty worktree before render-engine hard-cut"
```

Expected: 脏 worktree 被固化为可回溯快照提交。

**Step 4: Freeze the original branch for the duration of this effort**

Run:

```bash
git worktree list
```

Expected: snapshot 已存在；后续 render-engine hard-cut 只在 `main` 上推进，不再向原 `feature/issue-loop-20260312-152941` 写入任何新改动。

**Step 5: Commit the plan state**

无需额外修改 `main` 代码；本任务的完成信号是 snapshot 分支与提交已存在。

---

## Final Hard-Cut Decisions

### 最终 16 个公开模板名

- `single-clean`
- `single-formal`
- `single-minimal`
- `single-accent`
- `single-ats`
- `split-clean`
- `split-formal`
- `split-dark`
- `split-ats`
- `sidebar-clean`
- `sidebar-dark`
- `compact-clean`
- `compact-ats`
- `timeline-clean`
- `timeline-accent`
- `editorial-accent`

### 默认模板

- 默认模板固定为 `single-clean`

### 删除规则

- 当前对外的 50 个旧模板名全部删除
- 其余未列入的旧模板全部删除
- 不保留旧模板名 alias
- 不做旧名到新名的运行时迁移

### `src/render-engine/*` 最终目录树

```text
src/render-engine/
├── adapter.ts
├── builders.ts
├── constants.ts
├── generate-pdf.ts
├── qrcode.ts
├── types.ts
├── utils.ts
└── templates/
    ├── single-clean.ts
    ├── single-formal.ts
    ├── single-minimal.ts
    ├── single-accent.ts
    ├── single-ats.ts
    ├── split-clean.ts
    ├── split-formal.ts
    ├── split-dark.ts
    ├── split-ats.ts
    ├── sidebar-clean.ts
    ├── sidebar-dark.ts
    ├── compact-clean.ts
    ├── compact-ats.ts
    ├── timeline-clean.ts
    ├── timeline-accent.ts
    └── editorial-accent.ts
```

### Registry 一致性要求

- `BUILTIN_TEMPLATE_NAMES`
- `TEMPLATE_LIST`
- `TEMPLATE_BUILDERS`
- `src/render-engine/templates/*`

这四处必须在最终 16 模板集合上完全一致。

---

### Task 1: 冻结新的公开模板目录与硬切错误语义

**Files:**
- Modify: `src/template/spec.ts`
- Modify: `src/constants.ts`
- Modify: `src/template/custom-template.ts`
- Modify: `tests/template-spec.test.mjs`
- Test: `tests/template-spec.test.mjs`
- Create: `tests/template-catalog-hard-cut.test.mjs`

**Step 1: Write the failing test**

新增/修改测试，断言：

- 新公开模板目录只包含最终 16 个功能/结构命名
- 默认模板为 `single-clean`
- 旧模板名如 `classic`、`modern`、`elegant` 直接报错
- 错误信息包含“请使用 template list 查看新模板目录”
- `tests/template-spec.test.mjs` 不再断言 50 模板，而是断言最终 16 模板

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/template-spec.test.mjs tests/template-catalog-hard-cut.test.mjs`

Expected: FAIL，因为当前主干仍暴露旧模板目录与旧错误语义。

**Step 3: Write minimal implementation**

1. 在 `src/template/spec.ts` 冻结新的公开模板集合
2. 在 `src/constants.ts` 重写 `TEMPLATE_LIST`、`TEMPLATE_ALIASES`、`TEMPLATE_GROUPS`
3. 在 `src/template/custom-template.ts` 的模板解析路径中删除旧模板名兼容，并给出显式硬切错误
4. 更新 `tests/template-spec.test.mjs` 的计数与默认模板断言
5. 不改内部视觉实现，只先改模板注册表与解析契约

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/template-spec.test.mjs tests/template-catalog-hard-cut.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/template/spec.ts src/constants.ts src/template/custom-template.ts tests/template-spec.test.mjs tests/template-catalog-hard-cut.test.mjs
git commit -m "refactor: hard-cut public template catalog"
```

### Task 2: 先为渲染引擎重命名建立失败回归

**Files:**
- Create: `tests/render-engine-paths.test.mjs`
- Modify: `tests/jadeai-render-config.test.mjs`
- Modify: `tests/resume-visual-regression.test.mjs`
- Modify: `tests/pagination.test.mjs`
- Create: `tests/render-engine-registry.test.mjs`

**Step 1: Write the failing test**

新增测试，断言：

- 关键实现入口从 `dist/render-engine/*` 导入成功
- 测试中不再直接依赖 `dist/jadeai/*`
- `jadeai-render-config` 相关测试改名或改引用后，仍验证相同渲染契约
- `TEMPLATE_BUILDERS` 的 key 集合与 `BUILTIN_TEMPLATE_NAMES` 完全一致
- 默认模板存在于 `BUILTIN_TEMPLATE_NAMES`

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/render-engine-paths.test.mjs tests/render-engine-registry.test.mjs tests/jadeai-render-config.test.mjs`

Expected: FAIL，因为 `dist/render-engine/*` 还不存在。

**Step 3: Write minimal implementation**

1. 先改测试导入路径，明确目标模块名是 `render-engine`
2. 保留测试语义不变，只把实现命名从 `jadeai` 切换到中性目录
3. 增加 registry 一致性测试与默认模板存在性测试
4. 若测试文件名仍含 `jadeai`，在本任务中完成重命名并同步引用

**Step 4: Run test to verify it passes**

Run: `npm run build && node --test tests/render-engine-paths.test.mjs tests/render-engine-registry.test.mjs tests/jadeai-render-config.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/render-engine-paths.test.mjs tests/jadeai-render-config.test.mjs tests/resume-visual-regression.test.mjs tests/pagination.test.mjs
git commit -m "test: freeze render-engine entrypoints before module rename"
```

### Task 3: 将 `src/jadeai/*` 硬切为 `src/render-engine/*`

**Files:**
- Create: `src/render-engine/adapter.ts`
- Create: `src/render-engine/builders.ts`
- Create: `src/render-engine/constants.ts`
- Create: `src/render-engine/generate-pdf.ts`
- Create: `src/render-engine/qrcode.ts`
- Create: `src/render-engine/types.ts`
- Create: `src/render-engine/utils.ts`
- Modify: `src/commands.ts`
- Modify: `src/template/custom-template.ts`
- Modify: `src/flows/parse-optimize.ts`
- Modify: `src/flows/render.ts`
- Delete: `src/jadeai/adapter.ts`
- Delete: `src/jadeai/builders.ts`
- Delete: `src/jadeai/constants.ts`
- Delete: `src/jadeai/generate-pdf.ts`
- Delete: `src/jadeai/qrcode.ts`
- Delete: `src/jadeai/types.ts`
- Delete: `src/jadeai/utils.ts`
- Delete: `src/jadeai/templates/*.ts` (未保留模板)
- Test: `tests/render-engine-paths.test.mjs`
- Test: `tests/render-engine-registry.test.mjs`

**Step 1: Write the failing test**

基于 Task 2 的测试，补充断言：

- `src/commands.ts`、`src/template/custom-template.ts`、`src/flows/*` 均不再引用 `src/jadeai/*`
- 新路径导入后 HTML/PDF 关键入口仍可被调用

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/render-engine-paths.test.mjs`

Expected: FAIL，因为主代码还在导入 `src/jadeai/*`。

**Step 3: Write minimal implementation**

1. 物理迁移文件到 `src/render-engine/*`
2. 更新所有直接 import
3. 在 `src/render-engine/builders.ts` 中把 builder imports 与 registry 收口到最终 16 模板
4. 删除未保留模板的旧 builder 文件
5. 保持函数签名与行为不变，不在本任务中顺手重构 builder 逻辑
6. 删除旧目录中的实现文件

**Step 4: Run test to verify it passes**

Run: `npm run build && npm run typecheck && node --test tests/render-engine-paths.test.mjs tests/render-engine-registry.test.mjs tests/jadeai-render-config.test.mjs tests/pagination.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/render-engine src/commands.ts src/template/custom-template.ts src/flows/parse-optimize.ts src/flows/render.ts tests/render-engine-paths.test.mjs tests/jadeai-render-config.test.mjs tests/pagination.test.mjs
git rm src/jadeai/adapter.ts src/jadeai/builders.ts src/jadeai/constants.ts src/jadeai/generate-pdf.ts src/jadeai/qrcode.ts src/jadeai/types.ts src/jadeai/utils.ts
git commit -m "refactor: rename jadeai renderer to render-engine"
```

### Task 4: 去掉所有对外 `JadeAI` 品牌文案

**Files:**
- Modify: `src/cli/args.ts`
- Modify: `docs/plans/2026-03-12-resume-agent-design.md`
- Modify: `docs/plans/2026-03-12-resume-agent-implementation.md`
- Modify: `tests/jadeai-render-config.test.mjs`
- Create: `tests/render-engine-branding.test.mjs`

**Step 1: Write the failing test**

新增测试，断言：

- `usage()` 中不再出现 `JadeAI`
- 公共 docs 中不再把当前实现称为 `JadeAI 渲染器`
- 面向用户的测试名称与文案也不再使用该品牌词

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/render-engine-branding.test.mjs`

Expected: FAIL，因为当前文案仍含 `JadeAI`。

**Step 3: Write minimal implementation**

1. 把 CLI help 改成 `built-in template catalog` 或等价中性描述
2. 把设计/实施文档里的“现有 JadeAI 渲染器”改成中性表述
3. 将测试标题、断言文案中的 `JadeAI` 改成中性名称
4. 不在本任务宣称“已去版权化”

**Step 4: Run test to verify it passes**

Run: `npm run build && npm run typecheck && node --test tests/render-engine-branding.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/args.ts docs/plans/2026-03-12-resume-agent-design.md docs/plans/2026-03-12-resume-agent-implementation.md tests/jadeai-render-config.test.mjs tests/render-engine-branding.test.mjs
git commit -m "docs: remove JadeAI branding from public surfaces"
```

### Task 5: 收缩模板视觉集合到 16 个并固定默认模板

**Files:**
- Modify: `src/template/spec.ts`
- Modify: `src/constants.ts`
- Modify: `src/template/recommend.ts`
- Modify: `src/commands.ts`
- Modify: `tests/template-spec.test.mjs`
- Modify: `tests/template-recommend.test.mjs`
- Modify: `tests/prepare-export-cli.test.mjs`

**Step 1: Write the failing test**

补充断言：

- `template list` 只输出新的 16 个模板
- 默认模板固定为 `single-clean`
- recommendation / preview / prepare-export 不再产出已删除的旧模板名
- 所有原先硬编码 `"elegant"` 的默认路径均改为 `single-clean`

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/template-spec.test.mjs tests/template-recommend.test.mjs tests/prepare-export-cli.test.mjs`

Expected: FAIL，因为当前推荐与默认值仍可能返回旧模板。

**Step 3: Write minimal implementation**

1. 在 `src/template/spec.ts` 选定最终 16 模板
2. 在 `src/constants.ts` 同步模板列表与分组
3. 在 `src/template/recommend.ts` 收口推荐候选空间
4. 在 `src/commands.ts`、`src/template/custom-template.ts`、`src/flows/parse-optimize.ts` 更新默认模板与入口默认值

**Step 4: Run test to verify it passes**

Run: `npm run build && npm run typecheck && node --test tests/template-spec.test.mjs tests/template-recommend.test.mjs tests/prepare-export-cli.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add src/template/spec.ts src/constants.ts src/template/recommend.ts src/commands.ts tests/template-spec.test.mjs tests/template-recommend.test.mjs tests/prepare-export-cli.test.mjs
git commit -m "refactor: shrink built-in template set to new public catalog"
```

### Task 6: 证明视觉与导出主链没有被打坏

**Files:**
- Modify: `tests/resume-agent-e2e.test.mjs`
- Modify: `tests/resume-visual-regression.test.mjs`
- Modify: `tests/document-ir.test.mjs`
- Modify: `tests/render-tree.test.mjs`

**Step 1: Write the failing test**

补充断言：

- 保留模板在新命名下仍能生成 HTML / PDF / thumbnail
- IR / render-tree / pagination 主链不依赖旧目录名
- visual regression 仍能产出非空 PNG / PDF 首屏

**Step 2: Run test to verify it fails**

Run: `npm run build && node --test tests/document-ir.test.mjs tests/render-tree.test.mjs tests/resume-agent-e2e.test.mjs tests/resume-visual-regression.test.mjs`

Expected: FAIL，直到所有路径、默认模板与输出契约更新一致。

**Step 3: Write minimal implementation**

1. 修复测试夹具、默认模板、模板选择与导出路径中的新命名引用
2. 不新增视觉特性，只修到等价输出
3. 如某个旧模板无法等价映射到新 16 模板，删除该测试样例并替换成保留模板样例

**Step 4: Run test to verify it passes**

Run: `npm run build && npm run typecheck && node --test tests/document-ir.test.mjs tests/render-tree.test.mjs tests/resume-agent-e2e.test.mjs tests/resume-visual-regression.test.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/document-ir.test.mjs tests/render-tree.test.mjs tests/resume-agent-e2e.test.mjs tests/resume-visual-regression.test.mjs
git commit -m "test: re-freeze render outputs after render-engine hard-cut"
```

### Task 7: 全量清扫残留与最终门禁

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/template/custom-template.ts`
- Modify: `src/cli/args.ts`
- Modify: `docs/plans/2026-03-14-render-engine-hard-cut-design.md`
- Test: `tests/render-engine-branding.test.mjs`

**Step 1: Write the failing check**

增加最终扫尾检查：

- `rg 'JadeAI|src/jadeai|dist/jadeai|classic|modern|elegant' src tests docs` 结果只允许出现在已批准的迁移说明或历史设计上下文中
- 主代码路径中不再出现旧目录引用

**Step 2: Run check to verify it fails**

Run: `rg 'JadeAI|src/jadeai|dist/jadeai|classic|modern|elegant' src tests docs`

Expected: 能看到残留。

**Step 3: Write minimal implementation**

1. 清掉所有残留 import / 文案 / 默认模板名
2. 保留历史设计文档中必要的“过去式”引用，但不能把旧方案写成当前实现
3. 更新本设计文档中的实施状态说明

**Step 4: Run test to verify it passes**

Run:
- `npm run build`
- `npm run typecheck`
- `node --test tests/template-catalog-hard-cut.test.mjs tests/render-engine-paths.test.mjs tests/render-engine-branding.test.mjs tests/template-spec.test.mjs tests/template-recommend.test.mjs tests/prepare-export-cli.test.mjs tests/document-ir.test.mjs tests/render-tree.test.mjs tests/pagination.test.mjs tests/resume-agent-e2e.test.mjs tests/resume-visual-regression.test.mjs`
- `npm test`

Expected: PASS

**Step 5: Commit**

```bash
git add src tests docs
git commit -m "refactor: complete render-engine hard-cut and remove JadeAI remnants"
```
