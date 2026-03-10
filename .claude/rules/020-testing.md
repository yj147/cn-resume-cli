# Testing Standards

## Test Coverage

- All new features require tests
- Bug fixes should include regression tests
- Focus on critical paths: AI calls, tool execution, context management

## Test Types

- **Unit tests** - Test individual functions/methods
- **Integration tests** - Test component interactions (e.g., tool routing)
- **E2E tests** - Test user workflows in chat mode

## Running Tests

```bash
# Build the project first
npm run build

# Run existing tests
npm test

# Run specific test file
npm test -- path/to/test.js
```

## Test Conventions

- Test files should be colocated with source or in `__tests__` directory
- Use descriptive test names that explain what is being tested
- Follow AAA pattern: Arrange, Act, Assert
