# Resume Agent Architecture Review

**Date:** 2026-03-13  
**Reviewer:** architect review  
**Status:** Changes Requested

## Conclusion

当前仓库已经落下了大部分架构骨架，但**不能**判定为“设计与实现完全对齐”，因此**当前不通过架构师审核**。

## Aligned Areas

- canonical model / provenance 已收口：`src/core/provenance.ts`
- review service 已统一：`src/eval/review-service.ts`
- TemplateSpec / render tree / thumbnail 主链已成型：`src/template/spec.ts`、`src/layout-core/render-tree.ts`、`src/template/thumbnail.ts`
- export gate / prepare-export / smoke 已形成硬门禁：`src/export-gate.ts`、`src/commands.ts`、`scripts/smoke.sh`

## Blocking Gaps

1. `0-1 authoring` 真入口缺失  
   - 证据：`src/chat/planner.ts` 当前只规划 `parse-resume` / `optimize-resume` / `recommend-template`
2. patch 接受/拒绝没有用户入口，也未闭环到 controller 事件  
   - 证据：`src/chat/agent.ts` 有 `acceptPendingPatch/rejectPendingPatch`，但 `src/chat/slash.ts` 无对应命令
3. chat 保留 `state.status + workflowState` 双轨  
   - 证据：`src/chat/controller.ts`、`src/chat/session.ts`、`src/chat/runtime.ts`
4. `paginateDocument` 未接入 layout 主链  
   - 证据：`src/layout-core/pagination.ts` 已存在，但主 layout 仍由 `buildLayoutResultFromReview(...)` 驱动：`src/flows/render.ts`

## Required Closure

以上阻塞项已经登记到：

- `issues.csv:36`
- `issues.csv:37`
- `issues.csv:38`
- `issues.csv:39`
- `issues.csv:40`

只有在 `36-40` 全部完成、验证通过、并回写设计/实施计划后，才能把本评审状态更新为 **Approved**。
