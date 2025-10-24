#!/bin/bash

# Kaspa WASM SDK Update Tool
# Updates the committed WASM SDK resources to the latest version or a specific version
# This script belongs to @kasstamp/kaspa_wasm_sdk package

set -e

# Configuration
KASPA_REPO="kaspanet/rusty-kaspa"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR"
TEMP_DIR="/tmp/kaspa-wasm-update-$$"
DEFAULT_VERSION="v1.0.1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to get the latest release version (silent)
get_latest_version_silent() {
    local version
    if command -v curl >/dev/null 2>&1; then
        version=$(curl -s "https://api.github.com/repos/${KASPA_REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    elif command -v wget >/dev/null 2>&1; then
        version=$(wget -qO- "https://api.github.com/repos/${KASPA_REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    else
        version="$DEFAULT_VERSION"
    fi

    if [ -z "$version" ] || [ "$version" = "null" ]; then
        version="$DEFAULT_VERSION"
    fi

    printf '%s' "$version"
}

# Function to get the latest release version (with logging)
get_latest_version() {
    log_info "Fetching latest release version from GitHub..."
    
    local version=$(get_latest_version_silent)
    
    log_success "Latest version: $version"
    printf '%s' "$version"
}

# Function to clean existing WASM resources
clean_existing_resources() {
    log_info "Cleaning existing WASM resources..."

    # Remove nodejs directory
    if [ -d "$PACKAGE_DIR/nodejs" ]; then
        log_info "Removing existing nodejs/ directory..."
        rm -rf "$PACKAGE_DIR/nodejs"
    fi

    # Remove web directory
    if [ -d "$PACKAGE_DIR/web" ]; then
        log_info "Removing existing web/ directory..."
        rm -rf "$PACKAGE_DIR/web"
    fi

    # Remove dist directory (will be rebuilt)
    if [ -d "$PACKAGE_DIR/dist" ]; then
        log_info "Removing existing dist/ directory..."
        rm -rf "$PACKAGE_DIR/dist"
    fi

    log_success "Existing resources cleaned"
}

# Function to download and extract WASM SDK
update_wasm_sdk() {
    local version="$1"
    if [ -z "$version" ]; then
        version=$(get_latest_version_silent)
    fi

    log_info "Updating Kaspa WASM SDK to version: $version"

    # Clean existing resources first
    clean_existing_resources

    # Create temp directory
    rm -rf "$TEMP_DIR"
    mkdir -p "$TEMP_DIR"

    local zip_name="kaspa-wasm32-sdk-${version}.zip"
    local download_url="https://github.com/${KASPA_REPO}/releases/download/${version}/${zip_name}"

    log_info "Downloading: $download_url"
    if command -v curl >/dev/null 2>&1; then
        if ! curl -L -f -o "${TEMP_DIR}/${zip_name}" "$download_url"; then
            log_error "Failed to download WASM SDK from $download_url"
            log_info "Available releases: https://github.com/${KASPA_REPO}/releases"
            exit 1
        fi
    elif command -v wget >/dev/null 2>&1; then
        if ! wget -O "${TEMP_DIR}/${zip_name}" "$download_url"; then
            log_error "Failed to download WASM SDK from $download_url"
            log_info "Available releases: https://github.com/${KASPA_REPO}/releases"
            exit 1
        fi
    else
        log_error "Neither curl nor wget is available. Please install one of them."
        exit 1
    fi

    log_success "Downloaded ${zip_name}"

    log_info "Extracting WASM SDK..."
    cd "$TEMP_DIR"
    if ! unzip -q "${zip_name}"; then
        log_error "Failed to extract ${zip_name}"
        exit 1
    fi

    # Find the extracted kaspa-wasm32-sdk directory
    local sdk_dir=""
    if [ -d "kaspa-wasm32-sdk" ]; then
        sdk_dir="kaspa-wasm32-sdk"
    elif [ -d "rusty-kaspa-${version}/kaspa-wasm32-sdk" ]; then
        sdk_dir="rusty-kaspa-${version}/kaspa-wasm32-sdk"
    else
        log_error "Could not find kaspa-wasm32-sdk directory in extracted files"
        log_info "Contents of extracted archive:"
        find . -type d -name "*kaspa*" | head -10
        exit 1
    fi

    log_info "Found SDK directory: $sdk_dir"

    # Copy nodejs variant
    if [ -d "${sdk_dir}/nodejs" ]; then
        log_info "Installing Node.js WASM variant..."
        cp -r "${sdk_dir}/nodejs" "$PACKAGE_DIR/"
        log_success "Node.js variant installed"
    else
        log_error "Node.js variant not found in SDK"
        exit 1
    fi

    # Copy web variant
    if [ -d "${sdk_dir}/web" ]; then
        log_info "Installing Web WASM variant..."
        cp -r "${sdk_dir}/web" "$PACKAGE_DIR/"
        log_success "Web variant installed"
    else
        log_error "Web variant not found in SDK"
        exit 1
    fi

    # Go back to package directory
    cd "$PACKAGE_DIR"

    # Verify installation
    log_info "Verifying WASM SDK installation..."

    local errors=0

    # Check nodejs files
    if [ ! -f "nodejs/kaspa.js" ]; then
        log_error "Missing nodejs/kaspa.js"
        errors=$((errors + 1))
    fi

    if [ ! -f "nodejs/kaspa_bg.wasm" ]; then
        log_error "Missing nodejs/kaspa_bg.wasm"
        errors=$((errors + 1))
    fi

    # Check web files
    if [ ! -f "web/kaspa.js" ]; then
        log_error "Missing web/kaspa.js"
        errors=$((errors + 1))
    fi

    if [ ! -f "web/kaspa_bg.wasm" ]; then
        log_error "Missing web/kaspa_bg.wasm"
        errors=$((errors + 1))
    fi

    if [ $errors -gt 0 ]; then
        log_error "WASM SDK installation verification failed with $errors errors"
        exit 1
    fi

    log_success "WASM SDK installation verified successfully"

    # Update version in package.json
    if [ -f "package.json" ] && command -v jq >/dev/null 2>&1; then
        log_info "Updating package.json version..."
        local new_version="${version#v}" # Remove 'v' prefix
        jq --arg version "$new_version" '.version = $version' package.json > package.json.tmp && mv package.json.tmp package.json
        log_success "Updated package.json version to $new_version"
    fi

    # Clean up temp directory
    rm -rf "$TEMP_DIR"

    # Show summary
    log_info "📊 Installation Summary:"
    echo "  • Node.js WASM: $(du -sh nodejs/ | cut -f1)"
    echo "  • Web WASM: $(du -sh web/ | cut -f1)"
    echo "  • Total size: $(du -sh nodejs/ web/ | tail -1 | cut -f1)"
    echo "  • Version: $version"

    log_success "🎉 Kaspa WASM SDK successfully updated to $version!"
    log_info "💡 Next steps:"
    echo "  1. Rebuild the TypeScript bridge: npm run build"
    echo "  2. Test the updated SDK: npm run validate"
    echo "  3. Commit the changes if everything works"
}

# Function to show usage
show_usage() {
    echo "Kaspa WASM SDK Update Tool"
    echo ""
    echo "Usage: $0 [VERSION]"
    echo ""
    echo "Arguments:"
    echo "  VERSION   Specific version to download (e.g., v1.0.1, v1.0.2)"
    echo "           If not specified, downloads the latest available version"
    echo ""
    echo "Examples:"
    echo "  $0                # Download latest version"
    echo "  $0 v1.0.1         # Download specific version v1.0.1"
    echo "  $0 latest         # Download latest version (explicit)"
    echo ""
    echo "This script will:"
    echo "  • Clean all existing WASM resources"
    echo "  • Download the specified/latest Kaspa WASM SDK"
    echo "  • Extract both nodejs/ and web/ variants"
    echo "  • Update package.json version"
    echo "  • Verify the installation"
}

# Main execution
echo "🚀 Kaspa WASM SDK Update Tool"
echo "============================="
echo ""
echo "This script updates the committed WASM SDK resources."
echo "All existing resources will be replaced with the new version."
echo ""

# Check if help was requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# Determine version to use
if [ "$1" = "latest" ] || [ -z "$1" ]; then
    log_info "Using latest available version"
    update_wasm_sdk
elif [ -n "$1" ]; then
    log_info "Using specified version: $1"
    update_wasm_sdk "$1"
else
    log_info "No version specified. Using latest available version."
    update_wasm_sdk
fi

echo ""
log_success "✨ Update complete! Your WASM SDK is ready for use."
