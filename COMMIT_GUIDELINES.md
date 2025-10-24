# Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **test**: Adding missing tests or correcting existing tests
- **ci**: Changes to our CI configuration files and scripts
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **chore**: Other changes that don't modify src or test files

## Scopes

- **web**: Web dashboard changes
- **js**: JavaScript/TypeScript SDK changes

## Examples

### Good Examples

```
feat(web): add user authentication
fix(js): resolve memory leak in wallet service
docs(web): update API documentation
test(js): add unit tests for crypto utilities
ci(global): add commitlint to workflow
refactor(web): simplify transaction building logic
chore(global): update dependencies
```

### Bad Examples

```
Add auth
fix bug
update docs
feat: add feature (missing scope)
fix(backend): resolve issue (invalid scope)
```

## Scope (Required)

You must specify a scope to indicate which part of the codebase is affected:

```
feat(web): add user authentication
fix(js): resolve memory leak in wallet service
docs(web): update API documentation
test(js): add unit tests for crypto utilities
ci(global): add commitlint to workflow
refactor(web): simplify transaction building logic
chore(global): update dependencies
```

## Body (Optional)

Use the body to explain what and why, not how:

```
feat: add file stamping functionality

Implement three stamping modes:
- Public inline mode
- Private inline mode
- Chunked mode for large files

This enables users to create proof-of-existence
for digital artifacts on the Kaspa blockchain.
```

## Footer (Optional)

Reference issues, breaking changes, etc:

```
feat!: redesign wallet API

BREAKING CHANGE: Wallet constructor now requires
a configuration object instead of individual parameters.

Closes #123
```

## Tips

1. **Use imperative mood**: "add feature" not "added feature"
2. **Keep subject line under 50 characters**
3. **Capitalize the subject line**
4. **Do not end the subject line with a period**
5. **Use the body to explain what and why**
6. **Use the footer to reference issues**

## Pre-commit Hook

Install the pre-commit hook to automatically check commit messages:

```bash
cd js
npm run commitlint
```

This will validate your commit message before it's created.
