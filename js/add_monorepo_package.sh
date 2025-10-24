#!/bin/bash

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if package name is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <package_name> [description] [dependencies...]"
    print_error "Example: $0 analytics \"Analytics utilities for Kasstamp\" @kasstamp/crypto @kasstamp/rpc"
    exit 1
fi

PACKAGE_NAME="$1"
PACKAGE_DESCRIPTION="${2:-Utilities for Kasstamp}"
shift 2 || shift 1  # Remove first two arguments (or just first if only one provided)
DEPENDENCIES=("$@")  # Remaining arguments are dependencies

# Validate package name (should be lowercase with underscores)
if [[ ! "$PACKAGE_NAME" =~ ^[a-z_]+$ ]]; then
    print_error "Package name should only contain lowercase letters and underscores"
    print_error "Example: analytics, crypto_utils, data_processor"
    exit 1
fi

# Define paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"
PACKAGES_DIR="$ROOT_DIR/packages"
PACKAGE_DIR="$PACKAGES_DIR/kasstamp_${PACKAGE_NAME}"
SCOPED_NAME="@kasstamp/${PACKAGE_NAME}"

print_status "Creating new package: $SCOPED_NAME"
print_status "Description: $PACKAGE_DESCRIPTION"

# Check if package already exists
if [ -d "$PACKAGE_DIR" ]; then
    print_error "Package directory already exists: $PACKAGE_DIR"
    exit 1
fi

# Step 1: Create directory structure
print_step "1. Creating directory structure..."
mkdir -p "$PACKAGE_DIR/src"
mkdir -p "$PACKAGE_DIR/dist"

# Step 2: Create package.json
print_step "2. Creating package.json..."
cat > "$PACKAGE_DIR/package.json" << EOF
{
  "name": "$SCOPED_NAME",
  "version": "0.1.0",
  "description": "$PACKAGE_DESCRIPTION",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md"
  ],
  "sideEffects": false,
  "license": "ISC",
  "scripts": {
    "build": "npm run build:bundle",
    "build:bundle": "tsup src/index.ts --dts --format esm --splitting false --clean --no-splitting --sourcemap"
  },
  "dependencies": {
EOF

# Add dependencies if provided
if [ ${#DEPENDENCIES[@]} -gt 0 ]; then
    for dep in "${DEPENDENCIES[@]}"; do
        if [[ "$dep" == @kasstamp/* ]]; then
            echo "    \"$dep\": \"*\"," >> "$PACKAGE_DIR/package.json"
        else
            # For external dependencies, you might want to specify versions
            echo "    \"$dep\": \"^1.0.0\"," >> "$PACKAGE_DIR/package.json"
        fi
    done
else
    # Add a placeholder comment
    echo "    \"__comment\": \"Add your dependencies here\"" >> "$PACKAGE_DIR/package.json"
fi

# Remove trailing comma if there are dependencies
if [ ${#DEPENDENCIES[@]} -gt 0 ]; then
    # Use sed to remove the last comma
    sed -i '' '$s/,$//' "$PACKAGE_DIR/package.json"
fi

cat >> "$PACKAGE_DIR/package.json" << EOF
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@typescript-eslint/eslint-plugin": "^8.44.0",
    "@typescript-eslint/parser": "^8.44.0",
    "eslint": "^9.35.0",
    "eslint-plugin-jest": "^29.0.1",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "jest-junit": "^16.0.0",
    "ts-jest": "^29.1.0",
    "tsup": "^8.0.0",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2"
  }
}
EOF

# Step 3: Create tsconfig.json
print_step "3. Creating tsconfig.json..."
cat > "$PACKAGE_DIR/tsconfig.json" << EOF
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": "../..",
    "paths": {
      "@kasstamp/*": ["packages/*/src"]
    },
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Step 4: Create basic source files
print_step "4. Creating basic source files..."

# Create a proper interface name from package name
INTERFACE_NAME=$(echo "${PACKAGE_NAME}" | sed 's/_/ /g' | sed 's/\b\w/\U&/g' | sed 's/ //g')

# Create index.ts
cat > "$PACKAGE_DIR/src/index.ts" << EOF
/**
 * @fileoverview Main entry point for @kasstamp/${PACKAGE_NAME}
 *
 * ${PACKAGE_DESCRIPTION}
 */

/**
 * Example function - replace with your actual implementation
 *
 * @param input - Input parameter
 * @returns Processed result
 */
export function processData(input: string): string {
  return \`Processed: \${input}\`;
}

/**
 * Example constant - replace with your actual exports
 */
export const PACKAGE_VERSION = '0.1.0';

/**
 * Example interface - replace with your actual types
 */
export interface ${INTERFACE_NAME}Options {
  /** Enable debug mode */
  debug?: boolean;
  /** Custom configuration */
  config?: Record<string, unknown>;
}

// Re-export everything as default for compatibility
export default {
  processData,
  PACKAGE_VERSION
};
EOF

# Create a basic types file
cat > "$PACKAGE_DIR/src/types.ts" << EOF
/**
 * @fileoverview Type definitions for @kasstamp/${PACKAGE_NAME}
 */

/**
 * Base configuration interface
 */
export interface BaseConfig {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Environment setting */
  environment?: 'development' | 'production' | 'test';
}

/**
 * Example result interface
 */
export interface ProcessResult {
  /** Success status */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}
EOF

# Create a basic test file
cat > "$PACKAGE_DIR/src/index.test.ts" << EOF
/**
 * @fileoverview Tests for @kasstamp/${PACKAGE_NAME}
 */

import { processData, PACKAGE_VERSION } from './index';

describe('@kasstamp/${PACKAGE_NAME}', () => {
  describe('processData', () => {
    it('should process input correctly', () => {
      const result = processData('test');
      expect(result).toBe('Processed: test');
    });

    it('should handle empty input', () => {
      const result = processData('');
      expect(result).toBe('Processed: ');
    });
  });

  describe('PACKAGE_VERSION', () => {
    it('should have correct version', () => {
      expect(PACKAGE_VERSION).toBe('0.1.0');
    });
  });
});
EOF

# Step 5: Create README.md
print_step "5. Creating README.md..."
cat > "$PACKAGE_DIR/README.md" << EOF
# $SCOPED_NAME

**${PACKAGE_DESCRIPTION}**

A TypeScript-first package for the Kasstamp ecosystem.

## 🚀 Features

- **Type-safe** - Full TypeScript support with comprehensive type definitions
- **Modern ESM** - ES modules with CommonJS compatibility
- **Zero dependencies** - Lightweight and focused
- **Well tested** - Comprehensive test suite
- **Enterprise ready** - Production-grade code quality

## 📦 Installation

\`\`\`bash
npm install $SCOPED_NAME
\`\`\`

## 🔧 Usage

### Basic Usage

\`\`\`typescript
import { processData } from '$SCOPED_NAME';

const result = processData('your-input');
console.log(result); // "Processed: your-input"
\`\`\`

### Advanced Configuration

\`\`\`typescript
import { processData, type ${INTERFACE_NAME}Options } from '$SCOPED_NAME';

const options: ${INTERFACE_NAME}Options = {
  debug: true,
  config: {
    customSetting: 'value'
  }
};

// Use with your configuration
\`\`\`

## 📚 API Reference

### Functions

#### \`processData(input: string): string\`

Processes the input data and returns a formatted result.

**Parameters:**
- \`input\` - The input string to process

**Returns:**
- Processed string with "Processed: " prefix

### Constants

#### \`PACKAGE_VERSION: string\`

The current package version.

### Types

#### \`${INTERFACE_NAME}Options\`

Configuration options interface.

## 🏗️ Building

\`\`\`bash
npm run build
\`\`\`

The build process uses `tsup` to create optimized bundles with TypeScript declarations.

## 📄 License

ISC License - see the [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please see our [contributing guidelines](../../CONTRIBUTING.md).

## 📋 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
EOF

# Step 6: Update root tsconfig.json paths
print_step "6. Updating root tsconfig.json paths..."
TEMP_FILE=$(mktemp)

# Add the new package to the paths mapping
jq --arg package_name "$PACKAGE_NAME" \
   --arg scoped_name "@kasstamp/${PACKAGE_NAME}" \
   --arg package_path "packages/kasstamp_${PACKAGE_NAME}/src" \
   '.compilerOptions.paths[$scoped_name] = [$package_path]' \
   "$ROOT_DIR/tsconfig.json" > "$TEMP_FILE"

mv "$TEMP_FILE" "$ROOT_DIR/tsconfig.json"

# Step 6.1: Update jest.config.mjs
print_step "6.1. Updating jest.config.mjs..."
# Create a temporary file with the updated Jest config
cat > /tmp/update_jest.js << EOF
const fs = require('fs');

// Read the current jest.config.mjs file
let content = fs.readFileSync('$ROOT_DIR/jest.config.mjs', 'utf8');

// Check if package already exists
if (content.includes('makeProject("${PACKAGE_NAME}")')) {
    console.log('Package already exists in Jest configuration');
} else {
    // Find the projects array and add the new package
    const lines = content.split('\\n');
    let insertIndex = -1;

    // Look for the last makeProject call in the projects array
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('makeProject(') && lines[i].includes('),')) {
            insertIndex = i + 1;
            break;
        }
    }

    if (insertIndex > 0) {
        // Get the indentation from the previous line
        const indent = lines[insertIndex - 1].match(/^\\s*/)[0];
        lines.splice(insertIndex, 0, indent + 'makeProject("${PACKAGE_NAME}"),');
        content = lines.join('\\n');

        fs.writeFileSync('$ROOT_DIR/jest.config.mjs', content);
        console.log('Added ${PACKAGE_NAME} to Jest configuration');
    } else {
        console.error('Could not find where to insert new Jest project');
    }
}
EOF

node /tmp/update_jest.js
rm /tmp/update_jest.js

# Step 7: Check if we need to update root package.json workspaces
print_step "7. Checking workspace configuration..."
if grep -q "packages/kasstamp_${PACKAGE_NAME}" "$ROOT_DIR/package.json"; then
    print_warning "Package already exists in workspace configuration"
else
    print_status "Package will be automatically included via packages/* glob pattern"
fi

# Step 8: Install dependencies from root (to handle workspace properly)
print_step "8. Installing dependencies from root..."
cd "$ROOT_DIR"
if npm install > /dev/null 2>&1; then
    print_status "✅ Dependencies installed successfully"

    print_step "9. Running initial build..."
    cd "$PACKAGE_DIR"
    if npm run build > /dev/null 2>&1; then
        print_status "✅ Initial build successful"
    else
        print_warning "⚠️  Build failed - run 'npm run build' in package directory to see errors"
    fi
else
    print_warning "⚠️  npm install failed - you may need to run 'npm install' manually from root"
    print_status "This is often due to workspace dependency resolution"
    print_status "After running 'npm install' from root, you can run:"
    print_status "  cd packages/kasstamp_${PACKAGE_NAME}"
    print_status "  npm run build"
fi

print_step "10. Validating package structure..."
cd "$PACKAGE_DIR"
if [ -f "package.json" ] && [ -f "tsconfig.json" ] && [ -f "src/index.ts" ]; then
    print_status "✅ Package structure created successfully"
else
    print_error "❌ Package structure incomplete"
    exit 1
fi

# Step 11: Summary
print_status ""
print_status "✅ Package $SCOPED_NAME created successfully!"
print_status ""
print_status "📁 Package location: $PACKAGE_DIR"
print_status "📦 Package name: $SCOPED_NAME"
print_status "📝 Description: $PACKAGE_DESCRIPTION"
print_status ""
print_status "🔧 Configuration files updated:"
print_status "  ✅ tsconfig.json - Added path mapping for @kasstamp/${PACKAGE_NAME}"
print_status "  ✅ jest.config.mjs - Added Jest project configuration"
print_status ""
print_status "🎯 Next steps:"
print_status "  1. Edit src/index.ts to implement your functionality"
print_status "  2. Update src/types.ts with your type definitions"
print_status "  3. Write tests in src/*.test.ts files"
print_status "  4. Update README.md with proper documentation"
print_status "  5. Run 'npm run build' to build the package"
print_status ""
print_status "🔧 Available commands:"
print_status "  cd packages/kasstamp_${PACKAGE_NAME}"
print_status "  npm run build        # Build the package"
print_status ""

# Return to original directory
cd "$ROOT_DIR"

print_status "🚀 Happy coding!"
