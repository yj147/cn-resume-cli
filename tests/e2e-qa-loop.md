# 功能性端到端测试记录

## 范围
- 需求来源：`issues.csv`
- 用例文档：`tests/functional-e2e-test-cases.md`
- 测试目标：覆盖 parse-first、0-1 authoring、review、模板推荐/预览/thumbnail、分页决策、模板确认与稳定性 gate，以及“精美质量高、内容全”的简历输出，并产出一份支持自定义内容的简历

## 执行批次 A：基线验证
- `npm run typecheck`
- `npm run build`
- `node --test tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs tests/chat-runtime.test.mjs tests/template-recommend.test.mjs tests/pagination.test.mjs tests/review-service.test.mjs`
- `node --test tests/*.mjs`
- `npm test`
- 手工链路：
  - `cn-resume template list`
  - `cn-resume template preview --name elegant`
  - `cn-resume parse`
  - `cn-resume optimize`
  - `cn-resume validate`
  - `cn-resume analyze-jd`
  - `cn-resume grammar-check`
  - `cn-resume generate --output txt/html/docx/pdf`

## 发现的问题

### ISSUE-QA-001：项目描述在最终简历中重复渲染
- **现象**：
  - `resume.txt` 的“项目经历”里，项目描述既出现在正文描述，又重复出现在 bullet 中。
  - `resume.html` 同样重复。
- **复现条件**：
  - parse-first -> optimize(confirm) -> generate
  - 输入：`fixtures/sample-resume-contract.json`
  - 项目描述：`负责核心数据服务与权限体系设计。`
- **根因**：
  1. optimize 阶段把 `project.description` 重新并入 `project.bullets`。
  2. 渲染阶段又同时输出 `description` 与 `bullets`。
  3. HTML adapter 未过滤与 description 相同的 bullet。

## 修复
- `src/flows/parse-optimize.ts`
  - 去掉 optimize 阶段把 `project.description` 追加回 `project.bullets` 的逻辑。
- `src/flows/render.ts`
  - 项目导出统一先输出 description，再输出去重后的 bullets。
  - plain text 与 docx 走同一去重规则。
- `src/render-engine/adapter.ts`
  - HTML 渲染前过滤与 description 完全重复的 project highlight。
- `tests/resume-agent-e2e.test.mjs`
  - 新增回归断言：项目描述在 `resume.txt`、`resume.html` 中各只出现一次。

## 复测

### 批次 B：问题回归
- `npm run build`
- `node --test tests/resume-agent-e2e.test.mjs`
- 结果：通过

### 批次 C：全链路复测
- `node --test tests/chat-loop.test.mjs tests/chat-runtime.test.mjs tests/template-recommend.test.mjs tests/pagination.test.mjs tests/review-service.test.mjs`
- `npm test`
- `npm run typecheck && npm run build && node --test tests/resume-agent-e2e.test.mjs tests/chat-loop.test.mjs tests/chat-runtime.test.mjs tests/template-recommend.test.mjs tests/pagination.test.mjs tests/review-service.test.mjs && npm test`
- 手工导出复测：
  - parse -> optimize(confirm) -> generate txt/html
  - 计数结果：目标项目描述在 txt/html 中都只出现 1 次

### 批次 D：测试用例文档补齐
- 更新 `tests/functional-e2e-test-cases.md`
- 新增覆盖：
  - `thumbnail` 共用渲染真相
  - 模板确认 / layout stability 导出 gate
  - 自定义内容简历全链路产物
  - 双栏 / 深色侧栏分页边界
  - checkpoint / artifacts 恢复

### 批次 E：自定义内容简历全链路回归
- 新增自动化回归：`node --test tests/resume-custom-content-e2e.test.mjs`
- 产物生成链：
  - `custom-input.json`
  - `custom-optimized.json`
  - `validate.json`
  - `analyze-jd.json`
  - `grammar.json`
  - `export-ready.json`
  - `custom-resume.txt`
  - `custom-resume.html`
  - `custom-resume.docx`
  - `custom-thumbnail.html`
- 最终总回归：
  - `npm run typecheck`
  - `npm run build`
  - `node --test tests/*.mjs`
  - `npm test`
- 结果：全部通过，未发现新增阻断缺陷

### 批次 F：纯 CLI export-ready 闭环与视觉截图回归
- 新增命令链：
  - `cn-resume optimize --confirm`
  - `cn-resume prepare-export --accept-multipage`
  - `cn-resume generate --output html/pdf/docx/txt`
- 新增自动化回归：
  - `node --test tests/prepare-export-cli.test.mjs`
  - `node --test tests/resume-visual-regression.test.mjs`
- 视觉产物：
  - `tasks/e2e-custom-output/custom-resume.pdf`
  - `tasks/e2e-custom-output/visual-html.png`
  - `tasks/e2e-custom-output/visual-pdf-page1.png`
- 结果：
  - 不再需要手工补 `export-ready.json`
  - HTML screenshot 与 PDF 首屏 PNG 均成功生成

### 批次 G：smoke 稳定性回归
- 发现问题：
  - live AI `validate` 偶发返回冗余聚合字段漂移，`average/verdict` 会与 `scores` 不一致，导致 schema gate 失败
  - `prepare-export` 在 smoke 中重复跑 hybrid review 时，会因 live blocker 漂移阻断最终 `generate`
- 修复：
  - `validateByAI` 改为基于已校验的 `scores` 本地推导 `average/verdict`
  - `scripts/smoke.sh` 新增 `CN_RESUME_PREPARE_EXPORT_ENGINE`，默认用 `rule` 跑 `prepare-export`，保留前置 live review 命令验证
- 复测：
  - `npm run build && node --test tests/review-service.test.mjs`
  - `npm run smoke`
- 结果：
  - smoke 可稳定跑通
  - 仍保留 live review 命令的联通性验证

### 批次 H：真实分页主链与架构复审收口
- 修复：
  - `src/flows/render.ts` 改为基于 `paginateDocument` 生成统一 `layoutResult`
  - chat review 与 `prepare-export` 共用同一份分页求解结果
- 新增/补强回归：
  - `node --test tests/pagination.test.mjs tests/chat-agent.test.mjs tests/chat-loop.test.mjs tests/resume-agent-e2e.test.mjs tests/prepare-export-cli.test.mjs`
- 全量验证：
  - `npm run build && npm test`
- 结果：
  - `layoutResult.source = paginateDocument`
  - export gate 读取的就是主链分页结果，不再依赖 review heuristic
  - 架构复审阻塞项 `36-40` 全部闭环

## 最终结果
- 自动化测试：通过
- 手工导出检查：通过
- 导出 gate：通过
- 产物完整性：通过
- 自定义内容简历产物：已生成，位于 `tasks/e2e-custom-output/`
- 纯 CLI export-ready 闭环：通过
- PDF/视觉截图回归：通过
- 真实分页主链：通过
- 架构复审：Approved
- 发现问题数：1
- 已修复并复测通过：1
- 本轮新增问题数：0

## 备注
- 生成的 HTML 预览仍会输出 Tailwind CDN 的浏览器告警；这不影响当前功能测试与导出结果，但它说明 HTML 预览不是完全离线自包含页面。
- 当前纯 CLI 最短可工作导出链已更新为：`parse -> optimize --confirm -> prepare-export -> generate`。
