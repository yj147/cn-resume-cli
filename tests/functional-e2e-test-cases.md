# Test Cases: cn-resume 功能性端到端测试

## Overview
- **Feature**: 基于 `issues.csv` 的简历 agent / CLI 全链路功能
- **Requirements Source**: `issues.csv`、`docs/plans/2026-03-12-resume-agent-design.md`、现有 CLI / chat 工作流
- **Test Coverage**: parse-first、0-1 authoring、patch 确认、控制器状态机、session 恢复、统一 review、模板解析/推荐/预览/thumbnail、分页决策、模板确认与稳定性 gate、最终产物质量、自定义内容简历产物
- **Last Updated**: 2026-03-14

## Test Case Categories

### 1. Functional Tests

#### TC-F-001: Parse-first 进入统一 canonical model 且保留 provenance
- **Requirement**: ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-004
- **Priority**: High
- **Preconditions**:
  - 已执行 `npm run build`
  - 存在输入样例 `fixtures/sample-resume-contract.json`
- **Test Steps**:
  1. 运行 `cn-resume parse --input fixtures/sample-resume-contract.json --output <tmp>/parsed.json`
  2. 检查 `basic`、`experience`、`projects`、`education`、`skills`、`custom_sections` 的字段结构
  3. 验证字段含 `value/source/confidence/status/updatedBy/updatedAt`
  4. 验证解析推断字段未被标记为 `confirmed`
- **Expected Results**:
  - 输出 JSON 成功生成
  - 基础信息与集合字段都已落入统一 envelope / provenance 结构
  - 没有第二套裸值 shape
- **Postconditions**: 得到可继续 optimize / review / export 的 canonical model

#### TC-F-002: Parse-first optimize 只生成 draft patch，并强制 Phase B 确认
- **Requirement**: ISSUE-005, ISSUE-006, ISSUE-007
- **Priority**: High
- **Preconditions**:
  - 已完成 TC-F-001
  - 存在 JD 样例 `fixtures/sample-jd.txt`
- **Test Steps**:
  1. 运行 `cn-resume optimize --input <tmp>/parsed.json --jd fixtures/sample-jd.txt --output <tmp>/await.json`
  2. 检查 `meta.phase_b.status`
  3. 尝试直接执行 `cn-resume generate --input <tmp>/await.json --output <tmp>/resume.txt`
  4. 使用 `--feedback` 与 `--confirm` 再次执行 optimize，生成 `<tmp>/confirmed.json`
- **Expected Results**:
  - 第一次 optimize 产物进入 `awaiting_feedback`
  - 未确认前导出被 `phase_b_unconfirmed` 阻断
  - 确认后生成 confirmed 模型，可进入后续 review / export
- **Postconditions**: 获得确认后的可导出候选模型

#### TC-F-003: 0-1 authoring 通过 patch 队列与模块确认推进，而非直接写 confirmed 内容
- **Requirement**: ISSUE-005, ISSUE-007, ISSUE-008
- **Priority**: High
- **Preconditions**:
  - `dist/commands/chat.js`、`dist/chat/*` 已构建
  - 可通过 `runChatLoop` 驱动对话回环
- **Test Steps**:
  1. 构造空 session，输入“优化当前简历”
  2. 执行 `/go`
  3. 观察 session 中 `pendingPatches`、`pendingApproval`
  4. 分别执行接受 patch 与拒绝 patch 分支
- **Expected Results**:
  - patch 先进入待确认队列
  - 接受后才更新正式内容
  - 拒绝后有审计记录且不污染 confirmed 数据
- **Postconditions**: session 保留明确的 patch 与确认状态

#### TC-F-004: 控制器状态机与 runtime 事件分发保持单一真相
- **Requirement**: ISSUE-009, ISSUE-010, ISSUE-011
- **Priority**: High
- **Preconditions**:
  - 已构建 chat runtime
- **Test Steps**:
  1. 触发 plan -> approval -> task execution 流程
  2. 检查 workflow state 在 `drafting/pending_confirmation/confirmed_content/layout_solving/ready_to_export` 之间的转移
  3. 读取持久化 session 并恢复
  4. 对非法状态转移发起动作
- **Expected Results**:
  - 合法动作经过 controller 显式转移
  - session 持久化 workflow state、pending patches、review/layout/template/checkpoints
  - 非法状态转移显式失败，不静默 fallback
- **Postconditions**: session 可恢复到最近稳定点

#### TC-F-005: CLI 与 chat 共用统一 review service，严重级一致
- **Requirement**: ISSUE-012, ISSUE-013, ISSUE-014
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 模型
- **Test Steps**:
  1. 分别运行 `validate`、`analyze-jd`、`grammar-check`
  2. 在 chat review 链路对同一模型触发审核
  3. 比较 blocker / warning / suggestion 结果结构
- **Expected Results**:
  - CLI 与 chat 使用统一协议
  - 相同输入下 severity 口径一致
  - review 输出可作为后续 gate 输入
- **Postconditions**: 获得统一 reviewResult

#### TC-F-006: canonical model -> Document IR -> TemplateSpec -> render tree -> HTML 主链可用
- **Requirement**: ISSUE-015, ISSUE-016, ISSUE-017, ISSUE-018, ISSUE-019, ISSUE-020
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 模型
- **Test Steps**:
  1. 选择 builtin 模板生成 HTML
  2. 校验模板名通过 TemplateSpec 解析
  3. 验证导出 HTML 包含标题、正文、侧栏/分组等结构
  4. 验证 alias / import 模板也能解析到统一协议
- **Expected Results**:
  - 导出主链只经过单一文档真相层
  - 16 个 builtin 模板解析成功
  - alias / import 不再走第二套协议
- **Postconditions**: 获得稳定 HTML 预览或导出结果

#### TC-F-007: 分页溢出进入显式决策，而不是静默压缩
- **Requirement**: ISSUE-021, ISSUE-022
- **Priority**: High
- **Preconditions**:
  - 已有内容密度高的模型
- **Test Steps**:
  1. 触发布局求解并制造超页
  2. 检查 layoutResult 是否进入 `overflow`
  3. 验证选项为 `accept_multipage / switch_compact_template / generate_compaction_patch`
  4. 在未决策时尝试导出
  5. 明确确认多页后再次进入导出流程
- **Expected Results**:
  - 未决策时导出被 `layout_decision_required` 阻断
  - 仅显式接受多页后可进入 `ready_to_export`
  - 系统不会静默删内容或偷偷压缩
- **Postconditions**: layoutResult 被明确确认

#### TC-F-008: 模板推荐给出 3 个候选，并支持真实内容预览 A/B 选择
- **Requirement**: ISSUE-023, ISSUE-024
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 模型与 review/layout 信号
- **Test Steps**:
  1. 分别操纵内容密度、岗位目标、偏好词、页数目标、ATS 偏好，运行模板推荐逻辑
  2. 检查候选数量、推荐理由、风险提示
  3. 基于真实内容生成至少两个模板预览
  4. 执行显式模板选择
- **Expected Results**:
  - 默认返回 3 个模板候选
  - 每个候选包含理由与风险
  - 预览基于真实内容，不是空模板
  - 模板切换不改动 confirmed 内容
- **Postconditions**: session / model 有明确模板选择结果

#### TC-F-009: 导出 gate 收紧所有前置条件，最终生成内容完整的简历产物
- **Requirement**: ISSUE-025
- **Priority**: High
- **Preconditions**:
  - 已完成 TC-F-002 ~ TC-F-008
- **Test Steps**:
  1. 对未确认 patch、review blocker、缺模板、缺 layoutResult、多页未确认等状态分别尝试导出
  2. 解决所有 gate 后分别导出 `txt/html/docx/pdf`
  3. 检查产物存在、非空、主要 section 完整
  4. 对 HTML/PDF 进行视觉检查
- **Expected Results**:
  - 所有未满足 gate 的场景都被显式阻断
  - 满足 gate 后导出成功
  - 产物内容完整、结构可读、主要模块齐全
- **Postconditions**: 得到可投递的最终简历输出

#### TC-F-010: thumbnail 与 preview / PDF 共用单一模板真相
- **Requirement**: ISSUE-026
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 模型
  - 可调用 builtin 模板渲染入口
- **Test Steps**:
  1. 用同一份模型分别生成 preview、PDF HTML 和 thumbnail
  2. 比较三者使用的模板名、layout family、section 顺序与 accent token
  3. 切换模板后重新生成三种产物
  4. 检查 thumbnail 未使用独立 hardcode 模板映射
- **Expected Results**:
  - 三种渲染入口共享同一 RenderTree + TemplateSpec 真相
  - 模板切换会同步影响 preview / PDF / thumbnail
  - thumbnail 不会偷偷走第二套模板协议
- **Postconditions**: 缩略图与主渲染链保持一致

#### TC-F-011: 支持自定义内容的简历可完成全链路导出
- **Requirement**: USER-REQ-001, ISSUE-024, ISSUE-025, ISSUE-026, ISSUE-027
- **Priority**: High
- **Preconditions**:
  - 已准备带自定义 summary / custom section / skills 的模型
  - 具备模板选择、layout result 与导出目录
- **Test Steps**:
  1. 构造一份含自定义内容的简历模型
  2. 走模板推荐 / 选择 / layout gate / generate 链路
  3. 输出 `txt/html` 简历到固定目录
  4. 校验自定义 summary、custom section、技能项在产物中完整出现
- **Expected Results**:
  - 自定义内容不会在导出链路中丢失或重复
  - 产物文件真实生成且非空
  - 最终得到一份可阅读的支持自定义内容简历
- **Postconditions**: 生成可供人工验收的自定义内容简历样例

#### TC-F-012: 0-1 authoring 全链路生成支持自定义内容的简历
- **Requirement**: USER-REQ-001, ISSUE-008, ISSUE-010, ISSUE-024, ISSUE-025, ISSUE-027
- **Priority**: High
- **Preconditions**:
  - chat runtime 可从空 session 启动
  - 可写入带自定义 summary / custom section 的用户输入
- **Test Steps**:
  1. 从空 session 进入 authoring 场景，生成 draft patch
  2. 明确确认 patch，使内容进入 confirmed_content
  3. 执行 review、模板推荐、模板确认、layout 决策
  4. 导出 `txt/html` 简历到固定目录
  5. 检查自定义 summary、附加信息、技能项在产物中完整出现
- **Expected Results**:
  - authoring 链路不绕过 patch / gate
  - 自定义内容在导出简历中完整可见
  - 最终得到一份支持自定义内容的简历产物
- **Postconditions**: 生成可用于人工验收的自定义内容简历

#### TC-F-013: 纯 CLI export-ready 闭环可直接导出，不再依赖手工补 export-ready JSON
- **Requirement**: USER-REQ-002
- **Priority**: High
- **Preconditions**:
  - 已有 `parse -> optimize --confirm` 产物
  - 可使用 `prepare-export` 命令
- **Test Steps**:
  1. 运行 `cn-resume prepare-export --input <optimized.json> --jd <jd.txt> --template single-clean --accept-multipage --output <export-ready.json>`
  2. 检查输出模型是否自动写回 `reviewResult/layoutResult/templateConfirmed`
  3. 直接运行 `cn-resume generate --input <export-ready.json> --output <resume.html>`
- **Expected Results**:
  - 不需要额外手工 patch JSON
  - `generate` 可直接消费 `prepare-export` 产物
  - 导出闭环保持纯 CLI
- **Postconditions**: 形成 parse -> optimize -> prepare-export -> generate 的可执行命令链

#### TC-F-014: PDF/视觉截图回归能稳定产出 HTML screenshot 与 PDF 首屏 PNG
- **Requirement**: USER-REQ-003
- **Priority**: High
- **Preconditions**:
  - 已有 export-ready 模型
  - Puppeteer / PDF 渲染环境可用
- **Test Steps**:
  1. 导出 `resume.html` 与 `resume.pdf`
  2. 生成 HTML screenshot
  3. 渲染 PDF 首屏 PNG
  4. 校验截图文件非空、PNG 头正确、尺寸合理
- **Expected Results**:
  - HTML screenshot 与 PDF 首屏 PNG 均可稳定生成
  - 视觉回归链可作为后续人工审查基线
- **Postconditions**: 获得可复查的视觉回归产物

### 2. Edge Case Tests

#### TC-E-001: 空值、推断值、确认值在统一模型中状态正确
- **Requirement**: ISSUE-001, ISSUE-002, ISSUE-003, ISSUE-004
- **Priority**: Medium
- **Preconditions**:
  - 可构造空模型与 parse-first 输入
- **Test Steps**:
  1. 检查空模型 `basic` 字段默认状态
  2. 检查 parse-first 推断字段状态
  3. 检查用户确认后状态升级
- **Expected Results**:
  - 空值不被标记为 confirmed
  - 推断值保留 suggested / inferred 语义
  - 仅确认后升级为 confirmed
- **Postconditions**: provenance 状态流转正确

#### TC-E-002: 模板别名、导入模板、模板冲突与模板循环均被正确处理
- **Requirement**: ISSUE-017, ISSUE-018
- **Priority**: Medium
- **Preconditions**:
  - 可操作 `cn-resume template import/clone`
- **Test Steps**:
  1. 导入合法模板文件
  2. clone builtin 模板为 alias
  3. 尝试制造保留名冲突与 alias cycle
- **Expected Results**:
  - 合法导入与 clone 成功
  - 冲突与循环显式失败
  - 不存在静默 fallback 到其他模板
- **Postconditions**: 模板配置保持单一协议

#### TC-E-003: 双栏与深色侧栏模板在跨页场景下保持分页与视觉骨架稳定
- **Requirement**: ISSUE-021, ISSUE-022
- **Priority**: Medium
- **Preconditions**:
  - 已准备足够长的内容模型
  - 可使用双栏模板与深色侧栏模板
- **Test Steps**:
  1. 选择双栏模板制造跨页
  2. 选择深色侧栏模板制造跨页
  3. 观察 layoutResult、分页决策以及产物结构
  4. 验证内容未被静默删减，且分页骨架保持可读
- **Expected Results**:
  - 双栏模板跨页后内容仍完整
  - 深色侧栏模板跨页背景与主内容骨架不崩坏
  - 系统不会通过静默压缩“假装单页成功”
- **Postconditions**: 高风险模板分页场景被覆盖

### 3. Error Handling Tests

#### TC-ERR-001: review blocker、未确认事实、未选模板、未解布局都能阻断导出
- **Requirement**: ISSUE-007, ISSUE-014, ISSUE-022, ISSUE-025
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 模型样本
- **Test Steps**:
  1. 分别注入 pending patch、review blocked、empty template、null layoutResult、overflow 未确认
  2. 逐一执行导出
- **Expected Results**:
  - 每种错误都返回明确 `BLOCKED:*` 原因
  - 错误不会被伪装为成功
- **Postconditions**: gate 错误原因可审计

#### TC-ERR-002: runtime 与 controller 对非法动作显式失败
- **Requirement**: ISSUE-009, ISSUE-011
- **Priority**: High
- **Preconditions**:
  - chat runtime 可运行
- **Test Steps**:
  1. 将 workflow state 置为 `blocked`
  2. 继续发起 optimize / export 等动作
- **Expected Results**:
  - 返回 `invalid controller transition` 或等价 blocked 错误
  - 不会绕过 controller 直接改 session / 正式内容
- **Postconditions**: 非法状态不会污染 session

#### TC-ERR-003: 模板未确认或 layout 不稳定时导出被阻断
- **Requirement**: ISSUE-027
- **Priority**: High
- **Preconditions**:
  - 已有 confirmed 内容模型
  - review 已通过
- **Test Steps**:
  1. 构造 `templateConfirmed=false` 的导出输入并尝试导出
  2. 构造 `layoutResult.stable=false` 的导出输入并尝试导出
  3. 构造 `layoutResult.templateId` 与当前模板不一致的输入并尝试导出
- **Expected Results**:
  - 三种场景分别返回 `template_confirmation_required` 或 `layout_stability_required`
  - 系统不会用 silent fallback 伪造稳定状态
- **Postconditions**: 导出稳定性合同可被自动化验证

### 4. State Transition Tests

#### TC-ST-001: session 恢复后从最近 checkpoint 继续，而不是丢状态猜上下文
- **Requirement**: ISSUE-010, ISSUE-011
- **Priority**: High
- **Preconditions**:
  - 已写入 active / named session
- **Test Steps**:
  1. 在待确认 patch、待布局决策、已选模板等不同状态保存 session
  2. 重新加载 runtime
  3. 检查 reviewResult、layoutResult、template selection、template comparison artifacts、export artifacts 是否仍在
  4. 继续执行后续动作
- **Expected Results**:
  - runtime 恢复正确 session
  - workflow state、review/layout/template/checkpoints 与关键 artifacts 不丢失
  - 后续动作从最近稳定点继续
- **Postconditions**: 恢复链路稳定

#### TC-ST-002: 模板推荐 -> 真实预览 -> 明确选择 -> ready_to_export 的状态链闭环成立
- **Requirement**: ISSUE-023, ISSUE-024, ISSUE-025
- **Priority**: High
- **Preconditions**:
  - 内容已 confirmed
  - review 与 layout 结果均可用
- **Test Steps**:
  1. 触发推荐
  2. 生成两套真实内容预览
  3. 明确选择模板
  4. 进入导出门禁检查
- **Expected Results**:
  - 只有显式选择后才满足模板 gate
  - 选择结果贯穿到最终导出
- **Postconditions**: 当前模板成为最终导出模板

#### TC-ST-003: 模板切换会使旧 layout 结果失效，直到新模板拿到稳定布局
- **Requirement**: ISSUE-024, ISSUE-027
- **Priority**: High
- **Preconditions**:
  - session 中已有已确认模板与稳定 layout result
  - 存在新的模板候选可切换
- **Test Steps**:
  1. 在已有稳定 layout 的 session 上切换到新模板
  2. 立即尝试进入导出流程
  3. 写回与新模板匹配且 `stable=true` 的 layout result
  4. 再次执行导出门禁
- **Expected Results**:
  - 模板切换后旧 layout result 被标记为失效
  - 未重新求解前导出被 `layout_stability_required` 阻断
  - 只有新模板的稳定 layout 结果就绪后，才能进入 `ready_to_export`
- **Postconditions**: 模板与布局稳定性闭环成立

## Test Coverage Matrix

| Requirement ID | Test Cases | Coverage Status |
|---------------|------------|-----------------|
| ISSUE-001 | TC-F-001, TC-E-001 | ✓ Complete |
| ISSUE-002 | TC-F-001, TC-E-001 | ✓ Complete |
| ISSUE-003 | TC-F-001, TC-E-001 | ✓ Complete |
| ISSUE-004 | TC-F-001, TC-E-001 | ✓ Complete |
| ISSUE-005 | TC-F-002, TC-F-003 | ✓ Complete |
| ISSUE-006 | TC-F-002 | ✓ Complete |
| ISSUE-007 | TC-F-002, TC-ERR-001 | ✓ Complete |
| ISSUE-008 | TC-F-003 | ✓ Complete |
| ISSUE-009 | TC-F-004, TC-ERR-002 | ✓ Complete |
| ISSUE-010 | TC-F-004, TC-ST-001 | ✓ Complete |
| ISSUE-011 | TC-F-004, TC-ERR-002, TC-ST-001 | ✓ Complete |
| ISSUE-012 | TC-F-005 | ✓ Complete |
| ISSUE-013 | TC-F-005 | ✓ Complete |
| ISSUE-014 | TC-F-005, TC-ERR-001 | ✓ Complete |
| ISSUE-015 | TC-F-006 | ✓ Complete |
| ISSUE-016 | TC-F-006 | ✓ Complete |
| ISSUE-017 | TC-F-006, TC-E-002 | ✓ Complete |
| ISSUE-018 | TC-F-006, TC-E-002 | ✓ Complete |
| ISSUE-019 | TC-F-006 | ✓ Complete |
| ISSUE-020 | TC-F-006 | ✓ Complete |
| ISSUE-021 | TC-F-007, TC-E-003 | ✓ Complete |
| ISSUE-022 | TC-F-007, TC-E-003, TC-ERR-001 | ✓ Complete |
| ISSUE-023 | TC-F-008, TC-ST-002 | ✓ Complete |
| ISSUE-024 | TC-F-008, TC-ST-002, TC-F-011, TC-F-012 | ✓ Complete |
| ISSUE-025 | TC-F-009, TC-ERR-001, TC-ST-002, TC-F-011, TC-F-012 | ✓ Complete |
| ISSUE-026 | TC-F-010, TC-F-011 | ✓ Complete |
| ISSUE-027 | TC-F-011, TC-F-012, TC-ERR-003, TC-ST-003 | ✓ Complete |
| USER-REQ-001 | TC-F-011, TC-F-012 | ✓ Complete |
| USER-REQ-002 | TC-F-013 | ✓ Complete |
| USER-REQ-003 | TC-F-014 | ✓ Complete |

## Notes
- 本轮测试优先覆盖“用户主导事实确认 + 高风险 gate + 导出质量”，不做与 issues.csv 无关的额外扩展。
- “精美质量高，内容全”的验收信号包括：主要 section 完整可见、内容无静默丢失、模板与排版选择明确、thumbnail/preview/PDF 一致、最终 HTML/PDF 视觉上可读且非空。
- 真实视觉质量需要结合生成产物截图做人工确认；结构性检查与自动化断言只能覆盖“完整/稳定/不缺内容”，不能代替审美判断。
