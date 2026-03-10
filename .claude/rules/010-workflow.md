# Development Workflow

## Branch Strategy

- `main` - production-ready code
- `develop` - integration branch
- `feature/*` - new features (e.g., feature/chat-mode)
- `fix/*` - bug fixes

## Pull Request Process

1. Create feature branch from `main`
2. Make changes with descriptive commits
3. Push and create PR with summary
4. Address review feedback
5. Merge after approval

## Chat Mode Implementation

Following the plan at `/home/jikns/.claude/plans/cuddly-strolling-crown.md`:

1. **Phase 1**: Infrastructure - Add Ink/React deps, create chat command entry
2. **Phase 2**: Agent Core - System prompt, tools, context management
3. **Phase 3**: Interaction - Slash commands, streaming output, session persistence
4. **Phase 4**: Testing - End-to-end testing

## Code Review Checklist

- [ ] Code follows project conventions
- [ ] TypeScript types pass
- [ ] No security issues introduced
- [ ] Documentation updated if needed
