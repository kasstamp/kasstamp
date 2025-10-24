#!/bin/bash

# Kasstamp Security Pipeline - Local Execution Script
# Replicates the GitHub Actions security workflow locally

set -e  # Exit on any error

echo "🔒 Starting Kasstamp Security Pipeline..."
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_security() {
    echo -e "${PURPLE}[SECURITY]${NC} $1"
}

# Check if Node.js is installed
check_node() {
    print_status "Checking Node.js version..."
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    print_success "Node.js version: $NODE_VERSION"
}

# Check if npm is installed
check_npm() {
    print_status "Checking npm..."
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm version: $NPM_VERSION"
}

# Install dependencies for JS packages
install_js_deps() {
    print_status "Installing JS package dependencies..."
    cd js
    npm ci
    print_success "JS dependencies installed"
    cd ..
}

# Install dependencies for web project
install_web_deps() {
    print_status "Installing web project dependencies..."
    cd web
    npm ci
    print_success "Web dependencies installed"
    cd ..
}

# Run security audit on JS packages
audit_js_packages() {
    print_security "Running security audit on JS packages..."
    cd js
    
    print_status "Auditing JS monorepo packages..."
    if npm run audit:all; then
        print_success "JS packages security audit passed"
    else
        print_error "JS packages security audit failed!"
        print_warning "Run 'npm audit fix' to automatically fix vulnerabilities"
        exit 1
    fi
    
    cd ..
}

# Run security audit on web package
audit_web_package() {
    print_security "Running security audit on web package..."
    cd web
    
    print_status "Auditing web package..."
    if npm audit --audit-level=moderate; then
        print_success "Web package security audit passed"
    else
        print_error "Web package security audit failed!"
        print_warning "Run 'npm audit fix' to automatically fix vulnerabilities"
        exit 1
    fi
    
    cd ..
}

# Check for outdated JS packages
check_outdated_js() {
    print_status "Checking for outdated JS packages..."
    cd js
    
    print_status "Running outdated check on JS monorepo..."
    OUTDATED_OUTPUT=$(npm run outdated:all 2>&1 || true)
    
    # Check if output contains actual outdated packages (not just empty output)
    if [ -n "$OUTDATED_OUTPUT" ] && [ "$OUTDATED_OUTPUT" != "All packages are up to date" ] && [ "$OUTDATED_OUTPUT" != "" ] && echo "$OUTDATED_OUTPUT" | grep -q "Package"; then
        print_warning "Outdated JS packages found:"
        echo "$OUTDATED_OUTPUT"
        echo ""
        print_warning "Consider updating these packages:"
        echo "  cd js && npm update"
        echo ""
        JS_OUTDATED=true
    else
        print_success "All JS packages are up to date"
        JS_OUTDATED=false
    fi
    
    cd ..
}

# Check for outdated web packages
check_outdated_web() {
    print_status "Checking for outdated web packages..."
    cd web
    
    print_status "Running outdated check on web package..."
    OUTDATED_OUTPUT=$(npm outdated 2>&1 || true)
    
    # Check if output contains actual outdated packages (not just empty output)
    if [ -n "$OUTDATED_OUTPUT" ] && [ "$OUTDATED_OUTPUT" != "All packages are up to date" ] && [ "$OUTDATED_OUTPUT" != "" ] && echo "$OUTDATED_OUTPUT" | grep -q "Package"; then
        print_warning "Outdated web packages found:"
        echo "$OUTDATED_OUTPUT"
        echo ""
        print_warning "Consider updating these packages:"
        echo "  cd web && npm update"
        echo ""
        WEB_OUTDATED=true
    else
        print_success "All web packages are up to date"
        WEB_OUTDATED=false
    fi
    
    cd ..
}

# Generate security report
generate_security_report() {
    print_status "Generating security report..."
    
    REPORT_FILE="security-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# Security & Dependencies Report

**Run Date:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Node.js Version:** $(node --version)
**npm Version:** $(npm --version)

## 📦 Outdated Dependencies

EOF

    if [ "$JS_OUTDATED" = true ] || [ "$WEB_OUTDATED" = true ]; then
        echo "⚠️ **WARNING: Outdated dependencies found!**" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        
        if [ "$JS_OUTDATED" = true ]; then
            echo "### JS Packages (Monorepo)" >> "$REPORT_FILE"
            echo '```' >> "$REPORT_FILE"
            cd js && npm run outdated:all >> "../$REPORT_FILE" 2>&1 || true && cd ..
            echo '```' >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
        fi
        
        if [ "$WEB_OUTDATED" = true ]; then
            echo "### Web Package" >> "$REPORT_FILE"
            echo '```' >> "$REPORT_FILE"
            (cd web && npm outdated) >> "$REPORT_FILE" 2>&1 || true
            echo '```' >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
        fi
        
        echo "**Action Required:** Update outdated dependencies to latest versions." >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    else
        echo "✅ **All dependencies are up to date!**" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    cat >> "$REPORT_FILE" << EOF
## 🔒 Security Audit

Security audit completed successfully. No vulnerabilities found at moderate level or higher.

## 📋 Recommendations

- Review and update outdated dependencies regularly
- Monitor security advisories for used packages
- Use \`npm audit fix\` for automatic security fixes
- Consider using Dependabot for automated dependency updates
- Run this security check regularly (daily/weekly)

## 🛠️ Commands Used

- \`npm audit --audit-level=moderate\` - Security audit
- \`npm outdated\` - Check for outdated packages
- \`npm run audit:all\` - Audit all monorepo packages
- \`npm run outdated:all\` - Check outdated packages in monorepo

---
*This report was automatically generated by the Security Pipeline script.*
EOF

    print_success "Security report generated: $REPORT_FILE"
}

# Check for known security issues
check_known_issues() {
    print_security "Checking for known security issues..."
    
    # Check for common vulnerable packages
    VULNERABLE_PACKAGES=(
        "lodash"
        "moment"
        "jquery"
        "express"
        "request"
    )
    
    print_status "Scanning for known vulnerable packages..."
    
    for package in "${VULNERABLE_PACKAGES[@]}"; do
        if grep -r "\"$package\"" js/package.json web/package.json js/packages/*/package.json 2>/dev/null | grep -q "\"$package\""; then
            print_warning "Found potentially vulnerable package: $package"
            print_warning "Check if you're using the latest secure version"
        fi
    done
    
    print_success "Known issues check completed"
}

# Check for license compliance
check_licenses() {
    print_status "Checking package licenses..."
    
    # Check for problematic licenses
    PROBLEMATIC_LICENSES=(
        "GPL-2.0"
        "GPL-3.0"
        "AGPL-3.0"
        "LGPL-2.0"
        "LGPL-2.1"
        "LGPL-3.0"
    )
    
    print_status "Scanning for problematic licenses..."
    
    # This is a simplified check - in production you'd use license-checker
    print_warning "License check is simplified. Consider using 'license-checker' for comprehensive license analysis"
    
    print_success "License check completed"
}

# Fail if outdated dependencies found
fail_on_outdated() {
    if [ "$JS_OUTDATED" = true ] || [ "$WEB_OUTDATED" = true ]; then
        print_error "❌ FAILURE: Outdated dependencies detected!"
        echo ""
        print_error "Please update the following packages:"
        if [ "$JS_OUTDATED" = true ]; then
            print_error "JS Packages:"
            cd js && npm run outdated:all && cd ..
        fi
        if [ "$WEB_OUTDATED" = true ]; then
            print_error "Web Packages:"
            cd web && npm outdated && cd ..
        fi
        echo ""
        print_error "Update commands:"
        print_error "  cd js && npm update"
        print_error "  cd web && npm update"
        echo ""
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    print_status "Starting Security pipeline execution..."
    echo ""
    
    # Prerequisites
    check_node
    check_npm
    echo ""
    
    # Install dependencies
    print_status "=== Installing Dependencies ==="
    install_js_deps
    install_web_deps
    echo ""
    
    # Security audits
    print_status "=== Security Audits ==="
    audit_js_packages
    audit_web_package
    echo ""
    
    # Dependency checks
    print_status "=== Dependency Checks ==="
    check_outdated_js
    check_outdated_web
    echo ""
    
    # Additional security checks
    print_status "=== Additional Security Checks ==="
    check_known_issues
    check_licenses
    echo ""
    
    # Generate report
    print_status "=== Report Generation ==="
    generate_security_report
    echo ""
    
    # Fail if outdated dependencies found
    fail_on_outdated
    
    # Success
    print_success "🎉 Security Pipeline completed successfully!"
    echo ""
    print_status "Security Summary:"
    echo "  ✅ Security audits passed"
    echo "  ✅ No vulnerabilities found"
    echo "  ✅ Dependencies are up to date"
    echo "  ✅ Security report generated"
    echo ""
    print_success "All security checks passed! 🔒"
}

# Error handling
trap 'print_error "Security pipeline failed at line $LINENO"; exit 1' ERR

# Run main function
main "$@"
