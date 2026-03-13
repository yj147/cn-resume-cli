# cn-resume Resume Agent Design

**Status:** Approved  
**Date:** 2026-03-12  
**Scope:** 把 cn-resume CLI 从“解析/优化命令集合”收口为“高智能、用户主导、可恢复、可导出的简历垂类 agent”

## Implementation Audit Status — 2026-03-13

- **当前判定**：设计、实现、任务台账已经对齐；剩余阻塞风险 = `0`
- **已闭环范围**：
  1. `0-1 authoring` 已进入 planner / tool / canonical patch 主链
  2. patch 接受/拒绝已有明确用户入口，并闭环到 controller 事件
  3. chat 已收敛为 `workflowState` 单一真相；`state.status` 仅保留派生 UI 视图，stable checkpoint 自动写入并可恢复
  4. `paginateDocument` 已接入主 layout 求解路径，并由 chat review / `prepare-export` / export gate 共用同一份 `layoutResult`
  5. 自定义内容导出、视觉回归、纯 CLI export-ready 闭环与 QA loop 已完成
- **任务登记**：`issues.csv` 已覆盖并闭环 `1-40` 全部任务；其中 `36-40` 为最终设计对齐收口任务
- **架构评审状态**：复审结论已更新为 **Approved**，见 `docs/plans/2026-03-13-resume-agent-architecture-review.md`
- **验证证据**：
  - `npm run build && node --test tests/pagination.test.mjs tests/chat-agent.test.mjs tests/chat-loop.test.mjs tests/resume-agent-e2e.test.mjs tests/prepare-export-cli.test.mjs`
  - `npm run build && npm test`

---

## 1. Goal

目标不是做一个模板商城，也不是做一个自动捏造器。

目标是做一个面向中文简历场景的生产级 agent：

1. 同时支持 `parse-first` 与 `0-1 authoring`
2. 允许 AI 做高强度语义理解、拆解、候选生成、改写与推荐
3. 用明确的状态机、来源追踪与确认闭环约束事实写入
4. 通过统一模板系统、分页求解与导出链，产出真正可投递的简历

---

## 2. Product Principles

### 2.1 用户主导内容，AI 主导候选生成

- 内容事实以用户为准
- AI 可以补结构、补表达、补候选、补推荐
- AI 不能静默新增、改写、确认事实

### 2.2 不是限制智能，限制的是状态升级

- 限制对象：确认点、状态流转、副作用落地
- 非限制对象：理解、分析、改写、推荐、生成候选

### 2.3 模板的职责是降低设计决策成本

- 模板不是让用户自己设计
- 模板是让用户基于真实内容快速判断“哪个更好”
- 默认交互应是推荐与对比，不是 50 宫格盲选

### 2.4 真实简历质量优先于 JD 匹配

- 先保证内容真实、专业、完整
- 再追求岗位匹配和关键词优化

---

## 3. System Overview

系统采用 `控制器 + 工作流节点` 架构。

- **控制器（Controller）**：维护状态机、事件、gate、checkpoint，裁决哪些结果可以升级为正式状态
- **工作流节点（Nodes）**：负责解析、生成、审核、模板推荐、分页求解、导出
- **统一内容模型**：存放用户事实、字段来源、确认状态
- **统一文档模型**：存放 section 结构、排版约束、分页提示
- **统一模板规范**：存放布局骨架、视觉 token、section 呈现规则、分页策略

控制器是唯一的状态裁决者；节点不是事实源。

---

## 4. Dual Intake, Single Canonical Model

### 4.1 两条入口

1. `parse-first`
   - 输入 PDF / DOCX / 图片 / 文本
   - 解析后产出结构化候选
2. `0-1 authoring`
   - 输入用户对经历、岗位目标、风格偏好的口述
   - 由 agent 拆解并生成结构化候选

### 4.2 统一汇合点

两条入口都只产出 `ResumeDraft`，再汇入统一 `Canonical Resume Model`。

系统后续不再关心“这条内容来自解析还是对话”，只关心：

- 字段值
- 字段来源
- 置信度
- 确认状态

这样可以避免 parse 链和 authoring 链形成双系统。

---

## 5. Canonical Resume Model

`Canonical Resume Model` 是内容真相层，不直接承载模板或导出细节。

每个字段至少包含：

- `value`
- `source`
- `confidence`
- `status`
- `updatedBy`
- `updatedAt`

建议来源枚举：

- `user_explicit`
- `parsed_exact`
- `parsed_inferred`
- `ai_drafted`
- `ai_rewritten`
- `user_confirmed`

建议状态枚举：

- `empty`
- `suggested`
- `confirmed`
- `rejected`
- `stale`

模块粒度建议：

- 基本信息
- 个人总结
- 单条工作经历
- 单个项目
- 教育
- 技能 / 证书 / 语言
- 风格与模板偏好

---

## 6. Confirmation Model

### 6.1 确认粒度

正式确认粒度为“模块级 patch”，不是整份确认，也不是逐句打断。

### 6.2 AI 权限边界

- AI 可生成 2~3 个候选版本，覆盖力度与风格差异
- AI 可改写表达，但不得静默改事实
- `parsed_inferred`、`ai_drafted` 类内容必须以 patch 形式等待确认

### 6.3 导出前硬门禁

导出前必须满足：

1. 不存在未确认的事实字段
2. 不存在 blocker 级审核问题
3. 模板和分页结果稳定
4. 若超页，已取得用户明确同意

---

## 7. Controller State Machine

### 7.1 主状态

- `intake`
- `drafting`
- `pending_confirmation`
- `confirmed_content`
- `reviewing`
- `layout_solving`
- `ready_to_export`
- `exported`
- `blocked`

### 7.2 核心事件

- `USER_PROVIDED_INFO`
- `PARSE_COMPLETED`
- `PATCH_GENERATED`
- `PATCH_ACCEPTED`
- `PATCH_REJECTED`
- `REVIEW_FAILED`
- `LAYOUT_OVERFLOW`
- `USER_APPROVED_MULTIPAGE`
- `EXPORT_REQUESTED`

### 7.3 控制原则

- 用户可以跳步骤、插话、改目标
- 但任何跳转都不能绕过 gate
- 控制器裁决的是“状态升级条件”，不是内容生成策略

---

## 8. Node Responsibilities and Tool Policy

### 8.1 节点划分

- `parser`
- `authoring`
- `review`
- `template recommendation`
- `layout solving`
- `export`

### 8.2 低风险工具

以下动作可由节点直接调用：

- 只读文件
- 文本提取
- 结构化解析
- 审核分析
- 预览渲染
- 无副作用度量

### 8.3 高风险工具

以下动作必须经控制器批准：

- 应用正式内容 patch
- 确认事实写入
- 切换正式模板
- 覆盖导出产物
- 发起最终导出

这不是功能分级，而是副作用隔离。

---

## 9. Review Chain

审核链按四类能力组成，并按固定顺序执行：

1. `Fact Consistency Review`
2. `Content Quality Review`
3. `JD Match Review`
4. `Layout Quality Review`

审核输出不是空泛点评，而是：

- 问题定位
- 严重级别
- 原因
- 建议
- 可采纳 patch

严重级别分为：

- `blocker`
- `warning`
- `suggestion`

当前仓库已有 CLI 侧审核能力：

- `src/commands.ts` 中的 `runValidate` / `runAnalyzeJd` / `runGrammarCheck`
- `src/eval/evaluation.ts` 中的 rule + AI 评估逻辑

后续 chat/agent 侧必须复用统一审核链，而不是再造一套行为。

---

## 10. ResumeDocument IR

`ResumeDocument IR` 是内容层到文档层的桥。

它负责表达：

- section 顺序
- block 层级
- 分栏结构
- 强调关系
- 标题与正文约束
- 分页提示

IR 不直接存原始聊天上下文，也不直接存最终 HTML/PDF。

引入 IR 的目的：

1. 把内容事实和排版结构解耦
2. 让 preview / PDF / thumbnail 共享单一文档真相
3. 避免模板逻辑绑死在导出或 UI 某一侧

---

## 11. Template System

### 11.1 产品面

产品层保留 50 个模板名，继续作为用户可见的模板集合。

当前仓库已存在：

- `src/constants.ts` 中的 50 个模板名
- `src/jadeai/builders.ts` 中的 50 个导出 builder 映射

### 11.2 工程面

模板必须收口为 `TemplateSpec`，而不是持续膨胀为“每模板多份独立代码”。

`TemplateSpec` 至少包含：

- `TemplateIntent`
- `LayoutFamily`
- `SectionRecipes`
- `VisualTokenPack`
- `PaginationPolicy`
- `ThumbnailRecipe`
- `TemplateOverrides`

### 11.3 可借鉴与不借鉴

JadeAI 值得借鉴的是：

- 模板风格覆盖广
- 骨架差异真实存在
- 深色侧栏/跨页背景等 PDF 细节有经验

JadeAI 不应照搬的是：

- preview / export / thumbnail 三套独立真相
- 每个模板手写重复 section 渲染逻辑

### 11.4 自定义策略

对用户开放的正式自定义应落在 token 与 layout knobs 上：

- 字体
- 字号
- 主色 / 辅色
- 间距
- 分隔线样式
- 栏宽
- 标题样式

默认不把任意 raw HTML/CSS 自由编辑作为主合同能力。

---

## 12. Pagination and Layout Solver

分页是模板系统的一部分，不是导出阶段的补救措施。

### 12.1 输入

- `ResumeDocument IR`
- `TemplateSpec`
- 页面尺寸 / 边距 / 字体度量 / 行高 / 间距

### 12.2 块级约束

每种 block 需要支持：

- `keepTogether`
- `allowSplit`
- `minLinesAtBottom`
- `minLinesAtTop`
- `splitPriority`

### 12.3 超页策略

超页是显式状态，不是错误。

系统在超页时必须给用户明确选项：

- 保持当前风格并接受多页
- 切换更紧凑模板
- 维持页数目标并生成压缩 patch

系统不得为了塞进一页而静默删减内容。

---

## 13. Template Recommendation UX

默认交互不是让用户逛 50 个模板，而是：

1. 基于内容密度、岗位目标、偏好词、ATS 诉求、页数目标推荐 3 个模板
2. 用用户自己的真实内容实时预览
3. 支持 A/B 对比
4. 再允许查看更多同类风格

模板在产品中的首要职责是降低设计决策成本，而不是暴露设计自由度。

---

## 14. Memory and Recovery

### 14.1 两类记忆

- `Short-term conversational memory`
- `Structured workflow state`

前者负责“聊得顺”，后者负责“系统不丢”。

### 14.2 结构化状态

系统至少持久化：

- 当前 workflow state
- `Canonical Resume Model`
- 字段来源与确认状态
- 待确认 patch 队列
- 模板选择
- 审核结果
- 分页结果
- 导出产物

### 14.3 Checkpoints

必须在以下节点打 checkpoint：

- 解析完成
- 生成 patch
- 用户确认 patch
- 审核完成
- 模板确定
- 分页求解完成
- 导出完成

---

## 15. Current Codebase Implications

当前仓库已经具备几个重要基础：

1. `src/core/model.ts`
   - 已有 JSON 归一化与基础内容模型
2. `src/jadeai/adapter.ts`
   - 已有内容模型到 JadeAI Resume 结构的适配
3. `src/jadeai/builders.ts`
   - 已有 50 模板导出入口
4. `src/flows/render.ts`
   - 已有 plain text / docx 渲染
5. `src/template/custom-template.ts`
   - 已有模板别名与导入模板能力
6. `src/chat/tools.ts`
   - 已有 parse / optimize 工具桥
7. `src/commands.ts` + `src/eval/evaluation.ts`
   - 已有 CLI 侧审核链

因此后续实现重点不是从零开始，而是把这些能力重新挂到统一模型、统一控制器和统一模板规范下。

---

## 16. Non-Goals

本轮不做：

1. 任意文档品类扩展（只做简历）
2. 原始 HTML/CSS 全自由编辑器
3. 多人格 agent 互聊式架构
4. 为内部旧结构保留兼容层
5. 为了追求抽象而压缩模板的骨架差异

---

## 17. Acceptance Criteria

只有当以下条件全部成立，系统设计才算落地成功：

1. parse-first 与 0-1 authoring 汇入同一内容真相层
2. 所有事实字段都具备来源追踪与确认状态
3. 控制器独占状态升级裁决
4. chat/agent 与 CLI 侧审核链收口
5. preview / PDF / thumbnail 共用单一模板真相
6. 模板推荐默认走“3 个候选 + 真实内容预览 + 理由解释”
7. 超页决策显式化
8. 结构化状态可恢复、可继续执行

---

## 18. References

- 当前模板清单：`src/constants.ts`
- 当前导出模板入口：`src/jadeai/builders.ts`
- 当前审核入口：`src/commands.ts`
- 当前评估逻辑：`src/eval/evaluation.ts`
- 当前 chat 工具桥：`src/chat/tools.ts`
