# IntelliJ IDEA / WebStorm Setup Guide

This guide helps you configure your JetBrains IDE to work seamlessly with our Prettier code formatting standards.

## 🎨 Automatic Code Style Setup

The repository includes pre-configured IntelliJ code style settings that match our Prettier configuration.

### Files Included:

- `.editorconfig` - Universal IDE configuration (auto-detected)
- `.idea/codeStyles/Project.xml` - IntelliJ-specific code style
- `.idea/codeStyles/codeStyleConfig.xml` - Enables per-project settings

## ⚙️ Setup Instructions

### Option 1: Use Prettier Plugin (Recommended)

This ensures 100% consistency with our CI formatting checks.

1. **Install Prettier Plugin**
   - Go to `Settings/Preferences` → `Plugins`
   - Search for "Prettier"
   - Install the official "Prettier" plugin
   - Restart IntelliJ

2. **Enable Prettier**
   - Go to `Settings/Preferences` → `Languages & Frameworks` → `JavaScript` → `Prettier`
   - Set **Prettier package**: `{project}/js/node_modules/prettier`
   - Set **Run for files**: `{**/*,*}.{js,ts,jsx,tsx,json,md}`
   - Check ✅ **On 'Reformat Code' action**
   - Check ✅ **On save**

3. **Test It**
   - Open any `.ts` or `.js` file
   - Press `Cmd+Alt+L` (Mac) or `Ctrl+Alt+L` (Windows/Linux)
   - File should be formatted according to Prettier rules

### Option 2: Use Built-in Code Style (No Plugin)

The repository includes IntelliJ code style XML that closely matches Prettier.

1. **Verify Project Settings**
   - Go to `Settings/Preferences` → `Editor` → `Code Style`
   - Scheme should show "Project" (already configured)
   - If not, click ⚙️ → `Import Scheme` → `IntelliJ IDEA code style XML`
   - Select `.idea/codeStyles/Project.xml`

2. **EditorConfig Support**
   - Go to `Settings/Preferences` → `Editor` → `Code Style`
   - Check ✅ **Enable EditorConfig support**

3. **Format Code**
   - Press `Cmd+Alt+L` (Mac) or `Ctrl+Alt+L` (Windows/Linux)

## 🔧 Code Style Settings Summary

Our code style matches these Prettier settings:

```json
{
  "semi": true, // Use semicolons
  "trailingComma": "es5", // Trailing commas where valid in ES5
  "singleQuote": true, // Use single quotes
  "printWidth": 100, // Line width: 100 characters
  "tabWidth": 2, // 2 spaces per indent
  "useTabs": false, // Use spaces, not tabs
  "arrowParens": "always", // Always parentheses around arrow function params
  "endOfLine": "lf", // Unix line endings
  "bracketSpacing": true // Spaces in object literals: { foo: bar }
}
```

## ✅ Verification

To verify your setup is working correctly:

1. **Open any TypeScript file**
2. **Add some intentionally messy code**:

   ```typescript
   const x = { a: 1, b: 2 };
   function foo(a, b) {
     return a + b;
   }
   ```

3. **Format the file** (`Cmd+Alt+L` / `Ctrl+Alt+L`)

4. **Expected result**:

   ```typescript
   const x = { a: 1, b: 2 };
   function foo(a, b) {
     return a + b;
   }
   ```

5. **Run CI check**:
   ```bash
   npm run format:check
   ```
   Should pass without errors.

## 🚨 Important Notes

- **Always use Prettier for final formatting** - The IntelliJ code style is close but not 100% identical
- **Before committing**: Run `npm run format` to ensure consistency
- **CI will check formatting** - Builds fail if code isn't formatted with Prettier
- **EditorConfig** is automatically detected by IntelliJ and doesn't require setup

## 🔗 Keyboard Shortcuts

| Action              | Mac               | Windows/Linux      |
| ------------------- | ----------------- | ------------------ |
| Format File         | `Cmd+Alt+L`       | `Ctrl+Alt+L`       |
| Format Selection    | `Cmd+Alt+L`       | `Ctrl+Alt+L`       |
| Optimize Imports    | `Ctrl+Alt+O`      | `Ctrl+Alt+O`       |
| Reformat + Optimize | `Cmd+Alt+Shift+L` | `Ctrl+Alt+Shift+L` |

## 📚 Additional Resources

- [Prettier Documentation](https://prettier.io/docs/en/)
- [IntelliJ Prettier Plugin](https://plugins.jetbrains.com/plugin/10456-prettier)
- [EditorConfig](https://editorconfig.org/)
