# Render Engine Hard-Cut Design

**Status:** Approved  
**Date:** 2026-03-14  
**Scope:** 以一次发布的硬切方式移除 `JadeAI` 品牌与实现命名，收缩公开模板集合，并保留当前 HTML/PDF 输出的主体视觉特征。

## 1. Summary

本次改造不是“改个目录名”，而是一次受控的架构硬切：

1. 去掉所有用户可见与内部实现中的 `JadeAI` 命名
2. 把 `src/jadeai/*` 重命名并抽离为我们自己的渲染引擎层
3. 将公开模板集合从 50 个收缩到 12–20 个，默认目标为 16 个
4. 旧模板名不兼容，不提供兼容层，不做 silent mapping
5. 在视觉尽量保形的前提下完成切换，用现有渲染/分页/视觉回归测试守门

## 2. Control Contract

- **Primary Setpoint**
  - 主干在不保留 `JadeAI` 命名与旧模板公开契约的前提下，完成可验证的渲染引擎硬切。
- **Acceptance**
  - `src/jadeai/*` 不再作为实现入口
  - CLI / docs / template list / error message 中不再出现 `JadeAI`
  - 公开模板名切换到新的功能/结构命名体系
  - 旧模板名直接报错
  - 现有 build / template / pagination / PDF / visual regression 通过
- **Guardrails**
  - 不引入兼容层、双路径、旧模板名 alias
  - 不借这次顺手重做视觉语言
  - 不把 `issue-loop` 的旧 `workflow.stage` 控制面带回主干
- **Recovery Target**
  - 任一阶段若破坏渲染等价性或主 CLI 契约，立即停止在当前 commit 并回退该阶段。
- **Rollback Trigger**
  - `tests/template-spec.test.mjs`、`tests/jadeai-render-config.test.mjs`、`tests/resume-visual-regression.test.mjs`、`npm test` 任一失败即停止推进。
- **Boundary**
  - 仅涉及：`src/jadeai/*`、`src/template/*`、`src/constants.ts`、`src/commands.ts`、`src/cli/args.ts`、`src/flows/*`、相关测试与设计文档。
- **Execution Branch Policy**
  - `main` 只保留稳定参考基线与已批准计划，不直接承载本轮实现改动。
  - 本轮实现必须在新的干净功能分支中推进，默认分支名为 `feature/render-engine-hard-cut`。
  - `feature/issue-loop-20260312-152941` 只作为待抽离材料来源，不参与实现主线。
- **Risks**
  1. 公开模板名硬切导致 userspace breakage
  2. 渲染路径重命名后 HTML/PDF 细节回归
  3. 将“去品牌”误判为“去版权化完成”

## 3. Current State Estimate

当前主干存在三类 `JadeAI` 耦合：

1. **用户契约层**
   - `src/cli/args.ts` 仍写有 `JadeAI taxonomy`
2. **模板真相层**
   - `src/constants.ts` 与 `src/template/spec.ts` 仍以现有 50 模板集合对外暴露
3. **渲染引擎层**
   - `src/commands.ts`、`src/template/custom-template.ts`、`src/flows/render.ts` 等仍直接依赖 `src/jadeai/*`

`issue-loop` 脏分支已经尝试做两类动作：

- 用户面去品牌与目录去耦
- 公开模板名整体替换与渲染模块搬迁

但它混入了未完成的 `layout-core` 替换与其他漂移改动，因此不能直接 merge，只能抽离思路与测试资产。

## 4. Chosen Approach

采用 **A：分层硬切，单次发布**。

### 为什么不用一步大爆炸

因为当前问题同时触碰：

- 用户可见文案
- 公开模板名契约
- 模板注册表
- HTML/PDF 渲染实现
- 回归测试路径

一步大爆炸最容易把品牌、模板、引擎、视觉回归混成一个不可验证的故障球。

### 为什么不用保留兼容层

用户已明确批准破坏性变更。保留旧模板名 alias 只会把复杂性留在未来，形成双真相和长期债务。

## 5. Target Architecture

### 5.1 三层结构

1. **用户契约层**
   - CLI help
   - template list
   - 公开模板名
   - 默认模板
   - 错误提示

2. **模板真相层**
   - `src/template/spec.ts`
   - `src/constants.ts`
   - `src/template/custom-template.ts`
   - 负责模板注册、分组、样式、导入与解析

3. **渲染引擎层**
   - 新的 `src/render-engine/*`
   - 承接当前 `src/jadeai/*` 的 adapter / builders / pdf / qrcode / utils / types / constants

### 5.2 冻结边界

- `src/layout-core/*` 继续只负责 IR / pagination / render tree
- 不把渲染引擎直接塞回 `layout-core`
- 不在本轮改 chat planner / runtime / workflow state

## 6. Module Renaming Plan

### 6.1 目录裁决

- 保留：`src/layout-core/*`
- 新增：`src/render-engine/*`
- 删除：`src/jadeai/*`

### 6.2 迁移动机

`layout-core` 是版式核心，不应混入模板 builder、PDF 输出、二维码与引擎工具函数。把 `src/jadeai/*` 重命名为 `src/render-engine/*`，语义最清晰，回归面也最可控。

### 6.3 直接受影响入口

至少包括：

- `src/commands.ts`
- `src/template/custom-template.ts`
- `src/flows/parse-optimize.ts`
- `src/flows/render.ts`
- 所有直接引用 `dist/jadeai/*` 的测试文件

### 6.4 `src/render-engine/*` 最终目录树

最终目录树在开工前冻结如下：

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

规则：

- 不把模板实现文件继续保留为 50 个旧名字
- `builders.ts` 的 registry key 必须与最终 16 个公开模板名完全一致
- `tests` 中不允许再直接依赖 `dist/jadeai/*`

## 7. Public Template Hard-Cut

### 7.1 命名原则

采用“结构 + 目标特征”的功能型命名，而不是品牌词或情绪词。

命名模式：

- `single-*`
- `split-*`
- `sidebar-*`
- `compact-*`
- `timeline-*`
- `editorial-*`

### 7.2 最终模板数量

公开模板集合已冻结为 **16 个**。

### 7.3 最终公开模板名

最终公开模板名固定为：

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

### 7.4 删除策略

- 当前对外的 50 个旧模板名全部删除
- 未进入最终 16 个集合的其余旧模板，全部删除
- 本轮不保留“旧名 -> 新名”的 userspace 映射
- 允许在内部实现层做“视觉来源借鉴”，但不能暴露为外部兼容路径
- `src/render-engine/builders.ts` 与 `src/render-engine/templates/*` 只保留最终 16 个模板实现

### 7.5 用户契约规则

- 旧模板名直接报错
- 不保留 alias
- 错误信息明确提示：使用 `template list` 查看新模板目录
- 默认模板固定为 `single-clean`

## 8. Branding vs Copyright

本轮能完成的是：

- 去品牌
- 去目录命名耦合
- 去对外 `JadeAI` 文案

本轮**不能自动宣称完成**的是：

- 法律意义上的“去版权化”
- 来源与许可清洁证明
- 模板来源链路的合规归档

因此本轮交付口径必须是：

- `JadeAI` 品牌与实现命名已移除
- 渲染引擎已收口为自有逻辑
- 若需法律/许可审计，必须另开一轮来源审计任务

## 9. Extraction Candidates from issue-loop

可以安全吸纳的不是整分支，而是以下思路：

1. 帮助文案去品牌化
2. 模板目录改为中性 catalog 口径
3. 去品牌命名与内部路径重构思路
4. 与模板硬切相关的测试资产
5. `currentGoal + nextSteps` 的只读规划 UX 思路
6. 工具级 `transient / permanent / user-fixable` 错误分类与回归测试思路
7. 对低风险自动串联边界的测试设计思路

不能直接吸纳的部分：

1. 旧 `workflow.stage` 控制面
2. 整套旧 planner / autochain / retry 实现
3. 未完成的 `layout-core` 替换脏改动

### 9.1 本轮纳入范围

本轮设计直接纳入以下抽离点：

- 去品牌文案
- 中性模板目录口径
- 渲染引擎中性命名与路径重构
- 与模板硬切、目录硬切相关的测试资产

### 9.2 后续候选，不并入本轮硬切

以下点值得保留为后续重构议题，但不与本轮 render-engine 硬切绑在一起：

- `currentGoal` 作为 session 级目标槽位
- `nextSteps` 作为 planner 的只读输出协议
- bounded autochain 的受限自动串联
- 工具级最小错误分类与有限重试

原因：这些点主要落在 chat 控制面，而本轮主落点是模板真相层与渲染引擎层。强行绑定会把“去品牌/去实现耦合”和“控制面增强”混成一次高耦合变更。

### 9.3 Dirty Branch Handling Policy

`feature/issue-loop-20260312-152941` 在本轮的定位不是“待合并分支”，而是“待抽离材料库”。

本轮执行前必须先做以下处理：

1. **快照封存**
   - 在该 worktree 上创建独立 snapshot 分支或等价快照提交
   - 目标是保留当前脏状态，避免后续丢失可抽离素材
2. **执行期冻结**
   - 从快照创建完成起，不再向该脏分支继续提交新改动
   - 本轮实现以 `main` 为唯一开发主线
3. **完成后再裁决**
   - 若本轮 hard-cut 已吸纳全部高价值点，则删除原脏 worktree
   - 若仍有残余可借鉴点，则只从 snapshot 分支继续审计/抽离，不回到原脏 worktree 上开发

禁止动作：

- 在本轮开工前直接删除该脏分支
- 把该脏分支直接 merge 或 rebase 到 `main`
- 在该脏分支上继续混入本轮 render-engine 改造

## 10. Verification Strategy

### L0

- `npm run build`
- `npm run typecheck`

### L1

- `node --test tests/template-spec.test.mjs`
- `node --test tests/jadeai-render-config.test.mjs`
- `node --test tests/document-ir.test.mjs tests/render-tree.test.mjs`
- `node --test tests/pagination.test.mjs`

### L2

- `node --test tests/prepare-export-cli.test.mjs`
- `node --test tests/resume-agent-e2e.test.mjs`
- `node --test tests/resume-visual-regression.test.mjs`
- `npm test`

## 11. Residual Risks

1. **Userspace breakage is intentional**
   - 旧模板名会立即失效；这是批准后的硬切结果。
2. **视觉等价不是自然成立**
   - 必须依赖 PDF / visual regression gate，而不是相信“只是改名”。
3. **去品牌不等于去版权**
   - 本轮不输出任何“已完成法律清洗”的表述。

## 12. Final Decision

本次设计批准以下实现原则：

- 一次发布的硬切
- 不保留兼容层
- `src/jadeai/*` 整体迁到自有中性命名的渲染引擎层
- 公开模板名切换为功能/结构命名，并收缩到约 16 个
- 视觉尽量保形
- 法律/许可清理另立议题，不在本轮假装完成
