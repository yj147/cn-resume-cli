# Project Instructions

This file contains project-specific instructions for Claude Code.

## Project Context

cn-resume CLI - 中文简历解析、优化、生成工具。面向开发者的命令行工具，支持 AI 增强功能。

## Development Guidelines

- Follow the workflow defined in `.claude/rules/010-workflow.md`
- Adhere to testing standards in `.claude/rules/020-testing.md`
- Respect hard requirements in `.claude/rules/000-hard-requirements.md`

## Chat Mode Feature

This project is implementing a new chat mode for interactive AI conversation. See:
- Plan: `/home/jikns/.claude/plans/cuddly-strolling-crown.md`

## Team Conventions

- 使用 TypeScript 开发
- 遵循现有代码风格（参考 src/commands.ts）
- 复用现有 AI 函数（src/flows/parse-optimize.ts, src/eval/evaluation.ts）
