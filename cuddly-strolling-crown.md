# cn-resume 默认 TUI Agent 模式最终方案

## 一、结论

`cn-resume` 硬切为**默认进入 TUI 的简历领域单 Agent CLI**：

1. `cn-resume` 无参数时直接启动 TUI
2. `cn-resume chat` 保留为等价别名
3. `cn-resume parse|optimize|generate|validate|analyze-jd|grammar-check|template` 全部保留
4. Chat 与 Batch 共用同一套 LLM 接入、领域工具、Phase B 状态机
5. LLM SDK 统一采用 **Vercel AI SDK**
6. Provider 协议统一采用 **OpenAI-compatible**
7. 内部不保留旧的手写 fetch 客户端双轨方案，直接硬切

目标不是做一个通用 Agent 平台，而是做一个**围绕简历处理工作流的交互式 Agent Shell**。

---

## 二、硬约束

### 2.1 用户面兼容边界

保留现有用户命令面，不破坏显式 batch 用法：

- `cn-resume parse`
- `cn-resume optimize`
- `cn-resume generate`
- `cn-resume validate`
- `cn-resume analyze-jd`
- `cn-resume grammar-check`
- `cn-resume template *`

新增行为只有两点：

1. `cn-resume` 无参数不再只打印 help，而是进入 TUI
2. 新增 `cn-resume chat` 别名

### 2.2 确认门控

遵循项目要求：**先展示计划，用户确认后再执行**。

最终边界如下：

1. 纯问答、帮助、解释：直接回答，不确认
2. 任何工具执行：先生成简短计划，进入待确认态
3. 写文件、导出、覆盖：强确认
4. `optimize` 完成后若进入 Phase B，必须单独确认，不能绕过

### 2.3 内部硬切

以下内容不保留兼容双轨：

1. 不保留“旧 fetch client + 新 SDK client”并存
2. 不保留“关键词意图分类器 + LLM 工具调用”并存
3. 不保留“chat 自己一套状态机 + batch 自己一套状态机”并存

内部统一为一套：

- 一套 LLM client
- 一套会话状态
- 一套确认门控
- 一套领域工具适配层

---

## 三、产品形态

### 3.1 启动方式

```bash
# 默认进入 TUI
cn-resume

# 等价别名
cn-resume chat

# 保留现有 batch 命令
cn-resume parse --input resume.pdf --output model.json
```

### 3.2 TUI 角色定位

TUI 不是简单聊天窗口，而是：

1. 对话入口
2. 配置入口
3. 计划确认入口
4. 工具执行过程展示入口
5. 会话恢复入口

### 3.3 典型交互

```text
用户: 优化这份简历 /tmp/resume.pdf

AI: 计划：
1. 解析 PDF
2. 优化简历内容
3. 保存当前工作上下文

请输入 /go 确认，或 /cancel 取消。

用户: /go

AI: [执行 parse_resume]
AI: [执行 optimize_resume]
AI: 已完成优化。下一步需要你确认具体修改意见：
哪里需要修改？请指出具体模块与条目。

用户: 补强项目经历里的量化结果

AI: 计划：
1. 基于上一版优化结果补充反馈
2. 完成 Phase B 确认

请输入 /go 确认，或 /cancel 取消。
```

---

## 四、技术决策

### 4.1 TUI：Ink + React

采用 Ink。

原因：

1. 终端交互能力足够
2. 流式渲染自然
3. slash command、状态栏、消息列表都容易做
4. TypeScript 生态成熟

代价也接受：

1. 需要引入 JSX 编译配置
2. 需要新增 React/Ink 依赖

### 4.2 LLM SDK：Vercel AI SDK

统一采用：

- `ai`
- `@ai-sdk/openai-compatible`
- `zod`

理由：

1. Chat 流式输出：`streamText`
2. 工具调用：`tool`
3. 多步 agent loop：`stopWhen(stepCountIs(...))`
4. 结构化输出：`generateObject` 或 `generateText + Output.object`
5. 支持 OpenAI-compatible `baseURL/apiKey/model`

### 4.3 Provider 协议：只保留 OpenAI-compatible

不接 Anthropic 原生协议。

原因：

1. 当前项目配置链天然就是 `baseUrl + apiKey + model`
2. CLI 需要用户在 TUI 内自由切换 provider 地址
3. 单协议能最大化降低工程复杂度

最终配置项：

- `CN_RESUME_API_KEY`
- `CN_RESUME_BASE_URL`
- `CN_RESUME_AI_MODEL`
- `CN_RESUME_PROMPT_VERSION`
- `CN_RESUME_PARSE_ENGINE`
- `CN_RESUME_OPTIMIZE_ENGINE`
- `CN_RESUME_EVAL_ENGINE`

---

## 五、最终架构

### 5.1 分层

```text
TUI (Ink)
  ↓
Chat Agent State Machine
  ↓
Tool Adapters
  ↓
Domain Flows / Eval / Render / PDF
  ↓
LLM Client (Vercel AI SDK, OpenAI-compatible)
```

### 5.2 设计原则

1. UI 只负责展示和输入
2. Agent 只负责状态推进、计划确认、上下文选择
3. Tool Adapter 只负责把 Agent 意图映射到现有领域函数
4. Domain 层继续负责简历解析、优化、校验、导出
5. LLM Client 只负责模型调用，不掺业务逻辑

### 5.3 明确删除的过度设计

不做：

1. 本地关键词意图分类器
2. 独立“上下文引擎”抽象层
3. 通用 Agent Framework
4. 会话自动摘要压缩
5. 多 provider 原生协议混接
6. `bin/chat.sh`

---

## 六、目录结构调整

### 6.1 最终目录

```text
src/
├── index.ts
├── commands/
│   ├── batch.ts
│   └── chat.ts
├── chat/
│   ├── app.tsx
│   ├── agent.ts
│   ├── tools.ts
│   ├── session.ts
│   └── config.ts
├── llm/
│   ├── types.ts
│   └── openai-compatible.ts
├── flows/
├── eval/
├── jadeai/
├── pdf.ts
└── ...
```

### 6.2 重构范围

1. `src/index.ts`
   - 增加默认 TUI 启动逻辑
   - 增加 `chat` 别名路由
   - 保留 batch 路由

2. `src/commands.ts`
   - 拆成 `src/commands/batch.ts`
   - 新增 `src/commands/chat.ts`

3. `src/ai.ts`
   - 不再保留当前手写 fetch 实现
   - 直接改造成对 `src/llm/openai-compatible.ts` 的薄封装，或删除并替换调用点

4. `src/cli/args.ts`
   - 更新 help 文案
   - 增加 `chat` 说明

5. `tsconfig.json`
   - 支持 `.tsx`
   - 开启 JSX 配置

6. `package.json`
   - 新增 Vercel AI SDK、Ink、React 依赖
   - 新增 chat 测试脚本

---

## 七、LLM 接入方案

### 7.1 统一 client

新增 `src/llm/openai-compatible.ts`，职责：

1. 读取运行时配置
2. 创建 `createOpenAICompatible(...)` provider
3. 暴露两类能力：
   - `streamChat(...)`
   - `generateStructured(...)`

### 7.2 Chat 能力

Chat 使用 `streamText()`。

作用：

1. 普通对话
2. 工具调用
3. 多步执行
4. 流式渲染

约束：

1. tool execution 必须由我们本地控制
2. `stopWhen(stepCountIs(n))` 必须设置上限，避免死循环
3. 工具执行失败要显式显示，不做静默 fallback

### 7.3 Batch 能力

Batch 统一迁移到 Vercel SDK 的结构化输出能力：

1. `parse`
2. `optimize`
3. `validate`
4. `analyze-jd`
5. `grammar-check`

这些能力统一走：

- `generateObject(...)`
  或
- `generateText({ output: Output.object(...) })`

原则：

1. 仍然必须保留本地 schema gate
2. 仍然必须保留 retry/timeout 包装
3. 仍然必须保留 provider 对 structured output 不完全兼容时的错误暴露

### 7.4 不做的事

不做：

1. OpenAI 官方 SDK 和 Vercel SDK 并存
2. Chat 用 SDK、Batch 继续用 fetch
3. Provider 兼容失败时悄悄降级成自由文本输出

---

## 八、Agent 状态机

### 8.1 状态定义

```ts
type AgentState =
  | "idle"
  | "waiting_confirm"
  | "running"
  | "waiting_phase_b_feedback"
  | "error";
```

### 8.2 会话结构

```ts
interface ChatSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  state: AgentState;
  pendingPlan?: PendingPlan;
  currentResume?: {
    sourcePath?: string;
    model: ResumeModel;
  };
  currentJd?: {
    path?: string;
    text: string;
  };
  currentTemplate?: string;
  phaseB?: {
    runId?: string;
    status: "confirmed" | "awaiting_feedback";
    prompt: string;
    diff?: unknown;
  };
  artifacts: {
    latestModelPath?: string;
    latestPdfPath?: string;
    latestDocxPath?: string;
    latestReportPath?: string;
  };
}
```

### 8.3 状态推进规则

1. 初始为 `idle`
2. 识别到需要调用工具时，先生成 plan，切到 `waiting_confirm`
3. 用户输入 `/go` 或自然语言确认后，切到 `running`
4. 若 `optimize` 返回 Phase B 待确认，则切到 `waiting_phase_b_feedback`
5. Phase B 完成后回到 `idle`
6. 任一步失败则切到 `error`

### 8.4 Phase B 规则

Phase B 不是 chat 自己发明的流程，而是现有领域状态机的延续。

因此：

1. Chat session 必须显式保存 `phaseB`
2. `generate` / `validate` / `analyze-jd` / `grammar-check` 前必须检查是否已确认
3. 如果未确认，必须优先引导用户完成 Phase B

---

## 九、工具层设计

### 9.1 设计原则

Chat 不调用 CLI 子进程，不把 `cn-resume` 自己当 API。

原因：

1. 子进程会污染 stdout/stderr
2. flags 拼装复杂
3. 测试更难
4. 无法优雅复用会话内存状态

因此 chat 工具直接封装领域函数。

### 9.2 工具列表

#### `parse_resume`

输入：

- `filePath`

行为：

- `.pdf` / `.json` / 文本文件解析
- 返回结构化 `ResumeModel`

#### `optimize_resume`

输入：

- `resumeModel`
- `jdText`
- `feedbackText`

行为：

- 调用现有 optimize 能力
- 返回新 model 与 Phase B 状态

#### `validate_resume`

输入：

- `resumeModel`
- `jdText`
- `template`

#### `analyze_jd`

输入：

- `resumeModel`
- `jdText`

#### `grammar_check`

输入：

- `resumeModel`

#### `generate_resume`

输入：

- `resumeModel`
- `template`
- `format`
- `outputPath`

行为：

- html: `renderTemplate`
- pdf: `renderTemplate + generatePdf`
- docx: `generateDocx`
- txt: `modelToPlainText`
- json: 直接写出 model

### 9.3 工具执行策略

1. 工具执行前必须先有 plan
2. 工具执行结果要写回 session
3. 文件产物路径要记录到 `artifacts`
4. 工具失败要原样暴露

---

## 十、TUI 设计

### 10.1 界面布局

```text
┌────────────────────────────────────────────┐
│ cn-resume                                  │
├────────────────────────────────────────────┤
│ 消息区                                     │
│ - assistant / user / tool / error         │
│ - 流式输出                                 │
├────────────────────────────────────────────┤
│ 状态栏                                     │
│ state: waiting_confirm | model: xxx        │
│ template: elegant | resume: /tmp/a.pdf     │
├────────────────────────────────────────────┤
│ 输入区                                     │
│ >                                          │
└────────────────────────────────────────────┘
```

### 10.2 Slash 命令

必须提供：

- `/help`
- `/go`
- `/cancel`
- `/clear`
- `/save [name]`
- `/load [name]`
- `/config`
- `/model <id>`
- `/baseurl <url>`
- `/key <token>`
- `/template <name>`
- `/quit`

### 10.3 配置命令行为

`/model`、`/baseurl`、`/key`：

1. 更新内存中的当前配置
2. 同步写回 `~/.cn-resume/ai.env`
3. 后续同 session 与新 session 都生效

---

## 十一、配置与持久化

### 11.1 配置文件

继续复用：

```text
~/.cn-resume/ai.env
```

由 TUI 内命令维护，不再要求用户手工编辑。

### 11.2 会话文件

新增：

```text
~/.cn-resume/chat/
├── active.json
└── sessions/
    ├── session-20260311-001.json
    └── ...
```

策略：

1. 启动 TUI 时优先加载 `active.json`
2. `/save <name>` 保存为命名会话
3. `/load <name>` 显式恢复
4. 退出时覆盖 `active.json`

### 11.3 明文存储范围

按当前决策，明文保存：

1. 用户消息
2. 助手消息
3. 解析后的简历 model
4. JD 文本
5. 产物路径

但配置与会话仍然分离：

1. API key / baseURL / model 进 `ai.env`
2. 工作上下文进 session JSON

---

## 十二、实施清单

### 12.1 依赖与构建

1. 新增依赖：
   - `ai`
   - `@ai-sdk/openai-compatible`
   - `zod`
   - `ink`
   - `react`
2. 补充类型依赖：
   - `@types/react`
3. 修改 `tsconfig.json`：
   - 支持 `.tsx`
   - `jsx: "react-jsx"`
   - `include` 覆盖 `src/**/*.tsx`

### 12.2 路由与命令

1. `src/index.ts`
   - 无参数进入 `runChat()`
   - `chat` 子命令进入 `runChat()`
   - 其他命令保持原样
2. 拆分 batch/chat command

### 12.3 LLM 层

1. 新增 `src/llm/openai-compatible.ts`
2. 替换现有 `src/ai.ts` 直接 fetch 实现
3. 统一 timeout/retry/schema gate

### 12.4 Chat 层

1. `app.tsx`：UI
2. `agent.ts`：状态机
3. `tools.ts`：领域工具封装
4. `session.ts`：会话读写
5. `config.ts`：`ai.env` 读写

### 12.5 Batch 层迁移

将 parse/optimize/validate/analyze-jd/grammar-check 的 AI 路径统一迁移到 Vercel SDK。

### 12.6 文档与帮助

1. 更新 help
2. 更新 README
3. 更新 smoke/test 文档

---

## 十三、测试方案

### 13.1 保留现有测试

必须继续通过：

```bash
npm run build
npm run test
npm run test:ai-mock
```

### 13.2 新增测试

#### 单元/集成

1. session 读写
2. config 读写
3. plan 门控
4. Phase B 状态推进
5. chat tools 对领域函数的封装

#### Chat mock E2E

新增：

```bash
npm run test:chat-mock
```

覆盖场景：

1. `cn-resume` 默认进入 TUI
2. `cn-resume chat` 进入 TUI
3. 输入普通问答
4. 输入需要 plan 的操作
5. `/go` 执行工具
6. optimize 后触发 Phase B
7. `/model`、`/baseurl`、`/key` 写回 `ai.env`
8. `/save`、`/load`

### 13.3 验收标准

- [ ] `cn-resume` 无参数默认进入 TUI
- [ ] `cn-resume chat` 正常工作
- [ ] 现有 batch 命令不回归
- [ ] Chat 流式输出可见
- [ ] 所有工具执行前均先展示计划
- [ ] Phase B 无法绕过
- [ ] 配置可在 TUI 中修改并持久化
- [ ] 会话可自动恢复
- [ ] AI mock 测试可稳定通过

---

## 十四、非目标

本次不做：

1. 多 provider 原生协议接入
2. 语音输入
3. 图片文件直接作为一等简历输入
4. 云端同步会话
5. 自动摘要压缩历史消息
6. 通用插件系统

---

## 十五、最终一句话

`cn-resume` 将从“开发者 batch CLI”硬切为“默认进入 TUI、支持计划确认与 Phase B 门控、以 Vercel AI SDK 为统一 LLM 层的简历领域单 Agent CLI”，同时保留全部显式 batch 命令。
