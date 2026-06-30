#!/bin/bash
# Nexus Project Setup Script for MacBook
# Run: bash setup-mac.sh
set -e

echo "🚀 Setting up Nexus on Mac..."

# 1. Homebrew
if ! command -v brew &>/dev/null; then
  echo "📦 Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. Xcode CLI Tools (needed for Rust/cargo)
if ! xcode-select -p &>/dev/null; then
  echo "🔧 Installing Xcode CLI tools..."
  xcode-select --install
  echo "⚠️  Please complete the Xcode install dialog, then re-run this script."
  exit 1
fi

# 3. Node.js (v24+ for native TypeScript)
if ! command -v node &>/dev/null; then
  echo "📦 Installing Node.js..."
  brew install node
fi
echo "✅ Node: $(node -v)"

# 4. Rust
if ! command -v rustc &>/dev/null; then
  echo "🦀 Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
fi
echo "✅ Rust: $(rustc --version)"

# 5. Clone Nexus
NEXUS_DIR="$HOME/Desktop/Nexus-App"
if [ ! -d "$NEXUS_DIR" ]; then
  echo "📥 Cloning Nexus..."
  git clone https://github.com/DucklingGod/nexus.git "$NEXUS_DIR"
fi

# 6. Install deps
echo "📦 Installing dependencies..."
cd "$NEXUS_DIR"
npm install
cd engine && npm install && cd ..

# 7. Tauri CLI
echo "🦀 Installing Tauri CLI..."
npm install -D @tauri-apps/cli 2>/dev/null || true

# 8. Build check (frontend only first)
echo "🔍 Verifying frontend build..."
npm run build
echo "✅ Frontend build OK"

# 9. Full Tauri build
echo "🔨 Building Tauri app (this takes ~1 min)..."
npx tauri build
echo ""
echo "✅ Done! Nexus.app or nexus binary is in src-tauri/target/release/"
echo "   Run: npx tauri dev   (for development with hot-reload)"
