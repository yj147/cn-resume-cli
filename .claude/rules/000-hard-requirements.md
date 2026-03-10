# Hard Requirements

These are non-negotiable requirements that MUST be followed.

## Security

- Never commit secrets, API keys, or credentials
- Always validate user input at system boundaries
- Use parameterized queries for database operations (if applicable)

## Code Quality

- All code must pass TypeScript type checking before commit
- No commented-out code in production branches
- Functions should have single responsibility

## Chat Mode Specific

- 绝不编造、夸大或捏造任何简历经历和数据
- 仅使用用户明确提供的信息
- 如信息缺失，主动询问用户而非假设
- 计划确认模式：先展示计划，用户确认后再执行
