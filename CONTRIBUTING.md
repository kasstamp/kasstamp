# Contributing to KasStamp

Thank you for your interest in contributing to KasStamp! This guide will help you get started with contributing to our project.

## Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- Git

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/kasstamp.git
   cd kasstamp
   ```
3. **Install dependencies**:

   ```bash
   cd js
   npm install

   cd web
   npm install
   ```

4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Making Changes

### Code Style

- Follow the existing code style and conventions
- Use TypeScript for all new code
- Run the linter before committing:
  ```bash
  npm run lint
  npm run format
  ```

### Testing

- Write tests for new functionality
- Ensure all existing tests pass:
  ```bash
  npm test
  ```
- Maintain or improve test coverage

### Documentation

- Update relevant documentation
- Add JSDoc comments for new functions/classes
- Update README files if you add new features

## Submitting Changes

### Before Submitting

1. **Test your changes** thoroughly
2. **Run the build** to ensure everything compiles:
   ```bash
   npm run build
   ```
3. **Check for linting errors**:
   ```bash
   npm run lint
   ```

### Pull Request Process

1. **Push your changes** to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub with:
   - Clear, descriptive title
   - Detailed description of changes
   - Reference any related issues
   - Include screenshots for UI changes

### PR Guidelines

- **Keep PRs focused** - one feature/fix per PR
- **Write clear commit messages** following conventional commits (see [COMMIT_GUIDELINES.md](./COMMIT_GUIDELINES.md))
- **Respond to feedback** promptly
- **Update your PR** if requested changes are made

## Issue Reporting

### Before Creating an Issue

- Check if the issue already exists
- Search closed issues for similar problems
- Try the latest version

### Creating a Good Issue

Include:

- **Clear description** of the problem
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Environment details** (OS, Node.js version, etc.)
- **Screenshots/logs** if applicable

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the project's coding standards

## Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages. See [COMMIT_GUIDELINES.md](./COMMIT_GUIDELINES.md) for detailed guidelines.

### Quick Examples

```bash
# Good commit messages
feat(web): add user authentication
fix(js): resolve memory leak in wallet service
docs(web): update API documentation
test(js): add unit tests for crypto utilities
ci: add commitlint to workflow
refactor(web): simplify transaction building logic
chore: update dependencies

# Bad commit messages
Add auth
fix bug
update docs
feat: add feature (missing scope)
fix(backend): resolve issue (invalid scope)
```

### Pre-commit Validation

You can validate your commit messages locally:

```bash
npm run commitlint:check
```

## Questions?

- Check existing documentation first
- Open a discussion for general questions
- Use issues for bug reports and feature requests

Thank you for contributing to KasStamp! 🚀
