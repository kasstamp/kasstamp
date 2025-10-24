# Code Style Guide

This document outlines the coding standards and conventions used in the KasStamp project.

## Table of Contents

- [File Naming Conventions](#file-naming-conventions)
- [Code Formatting](#code-formatting)
- [TypeScript Guidelines](#typescript-guidelines)
- [React Component Guidelines](#react-component-guidelines)
- [Import/Export Conventions](#importexport-conventions)
- [CSS/Styling Guidelines](#cssstyling-guidelines)
- [Project Structure](#project-structure)
- [Tools and Commands](#tools-and-commands)

## File Naming Conventions

### Components

- **React Components**: PascalCase
  - `Button.tsx`
  - `UseCaseBlock.tsx`
  - `WalletCreateTab.tsx`
  - `ContentInterface.tsx`

### Utilities and Services

- **Utility Functions**: camelCase
  - `fileHelpers.ts`
  - `cn.ts`
  - `logger.ts`
- **Services**: PascalCase
  - `StampingService.ts`
  - `WalletService.ts`
  - `LinkPreviewService.ts`

### Types and Constants

- **Type Definitions**: camelCase with `.types.ts` suffix
  - `wallet.types.ts`
  - `stamping.types.ts`
- **Constants**: camelCase with `.constants.ts` suffix
  - `wallet.constants.ts`

### Hooks

- **Custom Hooks**: camelCase with `use` prefix
  - `useWallet.ts`
  - `useEstimation.ts`
  - `useFileUpload.ts`

### Pages

- **Page Components**: PascalCase with `Page` suffix
  - `StampPage.tsx`
  - `LearnPage.tsx` (exported as `LearnPage`)

## Code Formatting

### Prettier Configuration

We use Prettier for consistent code formatting across the project.

#### Configuration (`.prettierrc.json`)

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

#### Commands

```bash
# Format all files
npm run format

# Check formatting without making changes
npm run format:check

# Format specific file
npx prettier --write src/path/to/file.tsx
```

#### Integration with ESLint

- We use `eslint-config-prettier` to disable ESLint rules that conflict with Prettier
- Prettier handles formatting, ESLint handles code quality

## TypeScript Guidelines

### Type Safety

- **No `any` types**: Always specify proper types
- **Explicit return types**: For functions that might be ambiguous
- **Interface over type**: Prefer interfaces for object shapes

### Error Handling

```typescript
// Good
try {
  const result = await someAsyncOperation();
  return result;
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  throw new Error(`Operation failed: ${message}`);
}

// Avoid
try {
  const result = await someAsyncOperation();
  return result;
} catch (err) {
  throw err; // Too generic
}
```

### Event Handlers

```typescript
// Good - explicit typing
onFileInputChange={(e: React.ChangeEvent<HTMLInputElement>) => {
  // handler logic
}}

onRemoveAttachment={(i: number) => {
  // handler logic
}}

// Avoid - implicit any
onFileInputChange={(e) => {
  // handler logic
}}
```

## React Component Guidelines

### Component Structure

```typescript
// 1. Imports (external libraries first, then internal)
import React from 'react';
import { Button } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

// 2. Types/Interfaces
interface ComponentProps {
  title: string;
  onAction: () => void;
}

// 3. Component
export default function ComponentName({ title, onAction }: ComponentProps) {
  // 4. Hooks
  const [state, setState] = useState('');

  // 5. Event handlers
  const handleClick = () => {
    onAction();
  };

  // 6. Render
  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={handleClick}>Action</Button>
    </div>
  );
}
```

### Props and State

- Use descriptive prop names
- Prefer composition over complex prop drilling
- Use TypeScript interfaces for props
- Keep state as local as possible

### Event Handlers

- Use descriptive names (`handleClick`, `onSubmit`)
- Extract complex logic into separate functions
- Always type event parameters explicitly

## Import/Export Conventions

### Import Order

1. React and external libraries
2. Internal components (UI components first)
3. Types and interfaces
4. Utilities and services

```typescript
// External libraries
import React from 'react';
import { Button } from 'lucide-react';

// Internal UI components
import { Button } from '@/shared/components/ui/Button';
import { Dialog } from '@/shared/components/ui/Dialog';

// Internal features
import { useWallet } from '@/shared/hooks/useWallet';
import { walletService } from '@/features/wallet/services';

// Types
import type { WalletState } from '@/features/wallet/types';
```

### Export Patterns

```typescript
// Default export for main component
export default function ComponentName() {
  // component logic
}

// Named exports for utilities
export { utilityFunction } from './utils';

// Re-export patterns
export { Button, Dialog } from './ui';
export type { ComponentProps } from './types';
```

## CSS/Styling Guidelines

### Tailwind CSS

- Use Tailwind utility classes for styling
- Prefer utility classes over custom CSS
- Use CSS variables for theme colors: `var(--text)`, `var(--background)`

### Responsive Design

```typescript
// Mobile-first approach
<div className="text-sm sm:text-base md:text-lg">
  <h1 className="text-xl sm:text-2xl md:text-3xl">Title</h1>
</div>
```

### Dark Mode Support

```typescript
// Use CSS variables for theme-aware colors
<div style={{ color: 'var(--text)' }}>
  <span className="text-gray-600 dark:text-gray-300">Content</span>
</div>
```

### Component-Specific Styles

```css
/* Use descriptive class names */
.input-wrapper.has-floating .input-field {
  /* styles */
}

/* Avoid generic names */
.wrapper .field {
  /* styles */
}
```

## Project Structure

```
src/
├── core/                   # Core application logic
│   ├── layout/             # Layout components
│   ├── pages/              # Page components
│   └── utils/              # Core utilities
├── features/               # Feature-specific code
│   ├── stamping/           # Stamping feature
│   │   ├── components/     # Feature components
│   │   ├── hooks/          # Feature hooks
│   │   ├── services/       # Feature services
│   │   ├── types/          # Feature types
│   │   └── utils/          # Feature utilities
│   └── wallet/             # Wallet feature
├── shared/                 # Shared code
│   ├── components/         # Reusable components
│   │   └── ui/             # UI components
│   ├── hooks/              # Shared hooks
│   └── types/              # Shared types
└── test/                   # Test files
```

## Tools and Commands

### Development

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check
```

### Code Quality

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Testing

```bash
# Run tests
npm run test
```

## Best Practices

### Performance

- Use `React.memo()` for expensive components
- Implement proper dependency arrays in `useEffect`
- Use `useCallback` for event handlers passed to child components

### Accessibility

- Use semantic HTML elements
- Provide proper ARIA labels
- Ensure keyboard navigation works
- Test with screen readers

### Error Handling

- Use Error Boundaries for component errors
- Provide meaningful error messages
- Log errors appropriately
- Handle async operations gracefully

### Security

- Validate user inputs
- Sanitize data before rendering
- Use HTTPS in production
- Implement proper authentication

## IDE Configuration

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### Recommended Extensions

- Prettier - Code formatter
- ESLint
- TypeScript Importer
- Tailwind CSS IntelliSense
- Auto Rename Tag

## Contributing

When contributing to this project:

1. Follow the file naming conventions
2. Run `npm run format` before committing
3. Ensure all TypeScript errors are resolved
4. Write meaningful commit messages
5. Test your changes thoroughly
6. Update documentation if needed

## Examples

### Good Component Example

```typescript
import React, { useState, useCallback } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { useWallet } from '@/shared/hooks/useWallet';
import type { WalletState } from '@/features/wallet/types';

interface WalletButtonProps {
  onConnect: () => void;
  className?: string;
}

export default function WalletButton({ onConnect, className }: WalletButtonProps) {
  const [walletState] = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await onConnect();
    } finally {
      setIsConnecting(false);
    }
  }, [onConnect]);

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      className={className}
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </Button>
  );
}
```

### Good Utility Example

```typescript
// fileHelpers.ts
export function isImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const extension = getFileExtension(filename).toLowerCase();
  return imageExtensions.includes(extension);
}

export function getFileExtension(filename: string): string {
  return filename.slice(filename.lastIndexOf('.'));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

---

This code style guide should be followed by all contributors to maintain consistency and quality across the KasStamp project.
