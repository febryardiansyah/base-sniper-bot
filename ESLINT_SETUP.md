# ESLint Setup

This project now has ESLint and Prettier configured for consistent code formatting and linting.

## Available Scripts

- `npm run lint` - Run ESLint to check for linting issues
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is properly formatted
- `npm run type-check` - Run TypeScript type checking

## Configuration Files

- `eslint.config.js` - ESLint configuration (flat config format)
- `.prettierrc` - Prettier configuration
- `.prettierignore` - Files to ignore for Prettier
- `.vscode/settings.json` - VS Code editor settings
- `.vscode/extensions.json` - Recommended VS Code extensions

## Rules Overview

### ESLint Rules
- Enforces TypeScript best practices
- Warns about console usage (common in development)
- Prevents floating promises (important for async blockchain operations)
- Requires proper error handling for promises
- Disallows unused variables (except those prefixed with _)

### Prettier Rules
- Uses single quotes
- Semicolons enabled
- 2-space indentation
- 100 character line width
- Trailing commas for ES5 compatibility

## Pre-commit Hook (Optional)

To automatically lint and format code before commits, you can install husky and lint-staged:

```bash
npm install --save-dev husky lint-staged
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

Then add this to your package.json:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## VS Code Integration

The `.vscode/settings.json` file configures VS Code to:
- Format code on save with Prettier
- Run ESLint fixes on save
- Validate TypeScript files with ESLint
- Use Prettier as the default formatter

Install the recommended extensions for the best development experience.
