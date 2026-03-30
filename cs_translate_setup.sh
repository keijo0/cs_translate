#!/usr/bin/env bash
# =============================================================================
# cs_translate_setup.sh
# Automated setup for cs_translate with Ollama local AI translation on Linux
# =============================================================================
#
# Usage:
#   bash cs_translate_setup.sh
#   CS_TRANSLATE_MODEL=mistral bash cs_translate_setup.sh
#
# What this script does:
#   1. Checks that Node.js is installed
#   2. Installs Ollama if not already present
#   3. Starts the Ollama background service
#   4. Pulls your chosen language model (default: llama3)
#   5. Locates the cs_translate.js installation
#   6. Creates a backup of the original cs_translate.js
#   7. Patches cs_translate.js to add Ollama support via raw HTTP fetch
#   8. Configures cs_translate to use the local model
#   9. Launches cs_translate (in kitty terminal if available)
#
# No API keys or tokens are used or stored anywhere.

set -euo pipefail

# -----------------------------------------------------------------------------
# Colors
# -----------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'   # no color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

MODEL="${CS_TRANSLATE_MODEL:-llama3}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║        cs_translate + Ollama Setup Script        ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"
info "Model: ${BOLD}${MODEL}${NC}"
info "Ollama host: ${OLLAMA_HOST}"
echo ""

# -----------------------------------------------------------------------------
# 1. Check Node.js
# -----------------------------------------------------------------------------

info "Checking for Node.js..."
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install it first:
  Arch:          sudo pacman -S nodejs npm
  Debian/Ubuntu: sudo apt install nodejs npm
  nvm (any):     https://github.com/nvm-sh/nvm"
fi

NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  die "Node.js 18+ is required. Detected: v${NODE_VER}. Please upgrade."
fi
success "Node.js v${NODE_VER} found."

# -----------------------------------------------------------------------------
# 2. Install Ollama if missing
# -----------------------------------------------------------------------------

info "Checking for Ollama..."
if command -v ollama &>/dev/null; then
  OLLAMA_VER=$(ollama --version 2>/dev/null | head -1 || echo "unknown")
  success "Ollama already installed: ${OLLAMA_VER}"
else
  warn "Ollama not found. Installing via official installer..."
  if ! command -v curl &>/dev/null; then
    die "curl is required to install Ollama. Install it with your package manager."
  fi
  curl -fsSL https://ollama.com/install.sh | sh
  success "Ollama installed successfully."
fi

# -----------------------------------------------------------------------------
# 3. Start Ollama service
# -----------------------------------------------------------------------------

info "Starting Ollama service..."

# Check if already running
if curl -sf "${OLLAMA_HOST}/api/tags" &>/dev/null; then
  success "Ollama service is already running at ${OLLAMA_HOST}."
else
  # Try systemd first
  if systemctl is-active --quiet ollama 2>/dev/null; then
    success "Ollama systemd service is active."
  elif systemctl --user is-active --quiet ollama 2>/dev/null; then
    success "Ollama user systemd service is active."
  else
    # Start manually in the background
    info "Starting Ollama in the background (ollama serve)..."
    ollama serve &>/tmp/ollama_serve.log &
    OLLAMA_PID=$!
    disown "$OLLAMA_PID" 2>/dev/null || true

    # Wait up to 15 seconds for the service to become available
    info "Waiting for Ollama to become available..."
    for i in $(seq 1 15); do
      if curl -sf "${OLLAMA_HOST}/api/tags" &>/dev/null; then
        success "Ollama is running (PID ${OLLAMA_PID})."
        break
      fi
      sleep 1
      if [[ "$i" -eq 15 ]]; then
        die "Ollama did not start within 15 seconds. Check /tmp/ollama_serve.log for details."
      fi
    done
  fi
fi

# -----------------------------------------------------------------------------
# 4. Pull the language model
# -----------------------------------------------------------------------------

info "Pulling model '${MODEL}' (this may take a while on first run)..."
if ollama list 2>/dev/null | grep -q "^${MODEL}"; then
  success "Model '${MODEL}' is already available locally."
else
  ollama pull "${MODEL}" || die "Failed to pull model '${MODEL}'. Check your internet connection."
  success "Model '${MODEL}' pulled successfully."
fi

# -----------------------------------------------------------------------------
# 5. Locate cs_translate.js
# -----------------------------------------------------------------------------

info "Locating cs_translate installation..."

CS_TRANSLATE_JS=""

# Try common locations in order of preference
SEARCH_PATHS=(
  # npm link / global npm install
  "$(npm root -g 2>/dev/null)/cs_translate/bin/cs_translate.js"
  # AUR / system install
  "/usr/lib/cs_translate/bin/cs_translate.js"
  "/usr/local/lib/cs_translate/bin/cs_translate.js"
  # Local clone / development
  "$(pwd)/bin/cs_translate.js"
  "$HOME/cs_translate/bin/cs_translate.js"
)

for candidate in "${SEARCH_PATHS[@]}"; do
  if [[ -f "$candidate" ]]; then
    CS_TRANSLATE_JS="$candidate"
    break
  fi
done

# Fall back to `which cs_translate` and follow symlinks
if [[ -z "$CS_TRANSLATE_JS" ]] && command -v cs_translate &>/dev/null; then
  LINK_TARGET=$(command -v cs_translate)
  # Resolve symlink
  if [[ -L "$LINK_TARGET" ]]; then
    LINK_TARGET=$(readlink -f "$LINK_TARGET")
  fi
  if [[ -f "$LINK_TARGET" ]]; then
    CS_TRANSLATE_JS="$LINK_TARGET"
  fi
fi

if [[ -z "$CS_TRANSLATE_JS" ]]; then
  die "Could not locate cs_translate.js. Make sure cs_translate is installed (npm link or system package)."
fi

success "Found cs_translate.js at: ${CS_TRANSLATE_JS}"

# -----------------------------------------------------------------------------
# 6. Create backup of cs_translate.js
# -----------------------------------------------------------------------------

BACKUP="${CS_TRANSLATE_JS}.bak"
if [[ -f "$BACKUP" ]]; then
  warn "Backup already exists: ${BACKUP} — skipping backup step."
else
  cp "$CS_TRANSLATE_JS" "$BACKUP"
  success "Backup created: ${BACKUP}"
fi

# -----------------------------------------------------------------------------
# 7. Patch cs_translate.js to add Ollama support
# -----------------------------------------------------------------------------

info "Checking if Ollama patch is already applied..."

if grep -q "ollamaTranslate" "$CS_TRANSLATE_JS"; then
  success "Ollama patch already applied — skipping patch step."
else
  info "Patching ${CS_TRANSLATE_JS} to add Ollama support..."

  # Use Node.js to do a safe, idempotent patch
  node --input-type=module - "$CS_TRANSLATE_JS" "$MODEL" <<'NODEJS_PATCH'
import { readFileSync, writeFileSync } from "fs";

const [,, filePath, modelName] = process.argv;
let src = readFileSync(filePath, "utf8");

// --- Insert Ollama config variables after the existing OPENAI variables ---
const OLLAMA_VARS = `
let OLLAMA_MODEL = "${modelName || "llama3"}";
let USE_OLLAMA = false;
`;

// Insert after the OPENAI_MODEL variable declaration
const openaiModelVar = /^let OPENAI_MODEL\s*=.+$/m;
if (!src.match(openaiModelVar)) {
  console.error("Could not find OPENAI_MODEL variable in cs_translate.js — patch aborted.");
  process.exit(1);
}
src = src.replace(openaiModelVar, (match) => match + "\n" + OLLAMA_VARS.trim());

// --- Insert Ollama config loading in setupFromConfig() ---
const setupFromConfigMarker = /if \(cfg\.openaiModel\) OPENAI_MODEL = cfg\.openaiModel;/;
if (!src.match(setupFromConfigMarker)) {
  console.error("Could not find setupFromConfig marker — patch aborted.");
  process.exit(1);
}
src = src.replace(
  setupFromConfigMarker,
  (match) =>
    match +
    `\n  if (cfg.ollamaModel) OLLAMA_MODEL = cfg.ollamaModel;\n  if (typeof cfg.useOllama === "boolean") USE_OLLAMA = cfg.useOllama;`
);

// --- Add ollamaTranslate() function after the aiTranslate() function ---
const aiTranslateFnEnd = /^}\s*\n(\/\/ -{3,}\n\/\/ Translation)/m;
const OLLAMA_FUNCTION = `
// ---------------------------------------------------------------------------
// Ollama local AI translation — privacy-first, no API key needed
// ---------------------------------------------------------------------------

async function ollamaTranslate(text, toLang) {
  if (!USE_OLLAMA) return null;
  const langLabel = langName(toLang) || toLang.toUpperCase();
  const systemPrompt = \`You are a real-time chat translator for the game Counter-Strike 2 (CS2).
Translate the user's message to the requested language.
Rules:
- Preserve all CS2 gaming terms exactly as-is (e.g. bhop, wh, awp, gg, ez, rush, eco, clutch, smoke, flash, plant, defuse, etc.).
- Preserve player names, callout locations and clan tags exactly.
- Return ONLY the translated text — no explanation, no quotes, no extra commentary.
- If the message is already in the target language, return it unchanged.\`;

  const response = await fetch(\`\${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/chat\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: \`Translate to \${langLabel}:\\n\${text}\` },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(\`Ollama HTTP \${response.status}: \${await response.text()}\`);
  }

  const data = await response.json();
  const translated = data?.message?.content?.trim();
  if (!translated) throw new Error("Empty response from Ollama");
  return translated;
}

`;

if (!src.match(aiTranslateFnEnd)) {
  console.error("Could not find insertion point after aiTranslate() — patch aborted.");
  process.exit(1);
}
src = src.replace(aiTranslateFnEnd, (match, rest) => {
  // Insert the Ollama function between aiTranslate() closing brace and the Translation comment
  return "}\n" + OLLAMA_FUNCTION + rest;
});

// --- Patch smartTranslate() to try Ollama before OpenAI ---
const openaiCheckMarker = /\/\/ --- Try AI translation first if an OpenAI key is configured ---\s*\n\s*if \(OPENAI_API_KEY\) \{/;
if (!src.match(openaiCheckMarker)) {
  console.error("Could not find OpenAI check in smartTranslate() — patch aborted.");
  process.exit(1);
}
src = src.replace(
  openaiCheckMarker,
  `// --- Try Ollama local AI first if configured ---
  if (USE_OLLAMA) {
    try {
      const ollamaText = await ollamaTranslate(text, toLang);
      if (ollamaText) {
        const scriptHint = detectScriptHint(text) || "unknown";
        const res = {
          text: ollamaText,
          from: { language: { iso: scriptHint } },
          __aiTranslated: true,
          __ollamaTranslated: true,
          __confidence: 1,
        };
        cacheSet(text, toLang, res);
        return res;
      }
    } catch (err) {
      // Ollama failed — fall through to OpenAI / Google Translate
      console.log("⚠ Ollama translation failed (" + err.message + "), falling back...");
    }
  }

  // --- Try AI translation first if an OpenAI key is configured ---
  if (OPENAI_API_KEY) {`
);

// --- Tag Ollama translations in terminal output ---
// Find the __aiTranslated tag in the output function and add an Ollama label
const aiTagMarker = /res\.__aiTranslated/g;
src = src.replace(
  /chalk\.magenta\("\[AI\]"\)/g,
  `res.__ollamaTranslated ? chalk.cyan("[Ollama]") : chalk.magenta("[AI]")`
);

// --- Add Ollama config to defaultConfig ---
const defaultConfigEnd = /openaiModel:\s*"gpt-4o-mini",\s*\n\s*\};/;
if (src.match(defaultConfigEnd)) {
  src = src.replace(
    defaultConfigEnd,
    (match) =>
      match
        .replace("};", `  ollamaModel: "${modelName || "llama3"}",\n  useOllama: false,\n};`)
  );
}

// --- Persist Ollama keys in loadConfig() and saveConfig() ---
// loadConfig: add ollamaModel and useOllama
const loadConfigMerge = /openaiModel:\s*typeof cfg\.openaiModel.*\n/;
if (src.match(loadConfigMerge)) {
  src = src.replace(
    loadConfigMerge,
    (match) =>
      match +
      `      ollamaModel: typeof cfg.ollamaModel === "string" && cfg.ollamaModel ? cfg.ollamaModel : defaultConfig.ollamaModel,\n` +
      `      useOllama: typeof cfg.useOllama === "boolean" ? cfg.useOllama : defaultConfig.useOllama,\n`
  );
}

// saveConfig: add ollamaModel and useOllama
const saveConfigMerge = /openaiModel:\s*typeof cfg\.openaiModel.*\n(\s*\};)/;
if (src.match(saveConfigMerge)) {
  src = src.replace(
    saveConfigMerge,
    (match, closing) =>
      match.replace(
        closing,
        `      ollamaModel: typeof cfg.ollamaModel === "string" && cfg.ollamaModel ? cfg.ollamaModel : defaultConfig.ollamaModel,\n` +
        `      useOllama: typeof cfg.useOllama === "boolean" ? cfg.useOllama : defaultConfig.useOllama,\n` +
        closing
      )
  );
}

writeFileSync(filePath, src, "utf8");
console.log("Patch applied successfully.");
NODEJS_PATCH

  success "Ollama patch applied to ${CS_TRANSLATE_JS}."
fi

# -----------------------------------------------------------------------------
# 8. Configure cs_translate to use the local Ollama model
# -----------------------------------------------------------------------------

info "Configuring cs_translate to use Ollama model '${MODEL}'..."

if command -v cs_translate &>/dev/null; then
  node "$(command -v cs_translate | xargs readlink -f 2>/dev/null || command -v cs_translate)" \
    --init-config 2>/dev/null || true

  # Set Ollama model and enable Ollama in config
  node "$CS_TRANSLATE_JS" --set-ollama-model "${MODEL}" 2>/dev/null || \
    warn "Could not set Ollama model via CLI — you may need to set it manually in config.json."

  node "$CS_TRANSLATE_JS" --use-ollama 2>/dev/null || \
    warn "Could not enable Ollama via CLI — you may need to set useOllama: true in config.json."
else
  node "$CS_TRANSLATE_JS" --init-config 2>/dev/null || true

  node "$CS_TRANSLATE_JS" --set-ollama-model "${MODEL}" 2>/dev/null || \
    warn "Could not set Ollama model via CLI — you may need to set it manually in config.json."

  node "$CS_TRANSLATE_JS" --use-ollama 2>/dev/null || \
    warn "Could not enable Ollama via CLI — you may need to set useOllama: true in config.json."
fi

success "cs_translate configured to use Ollama (${MODEL})."

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

echo ""
echo -e "${BOLD}${GREEN}Setup complete!${NC}"
echo ""
echo -e "  Model:        ${CYAN}${MODEL}${NC}"
echo -e "  Ollama host:  ${CYAN}${OLLAMA_HOST}${NC}"
echo -e "  Backup:       ${YELLOW}${BACKUP}${NC}"
echo ""
echo -e "  To translate without any API keys:  ${BOLD}cs_translate${NC}"
echo -e "  To switch to a different model:     ${BOLD}CS_TRANSLATE_MODEL=mistral bash cs_translate_setup.sh${NC}"
echo -e "  To revert to original:              ${BOLD}cp ${BACKUP} ${CS_TRANSLATE_JS}${NC}"
echo ""

# -----------------------------------------------------------------------------
# 9. Launch cs_translate
# -----------------------------------------------------------------------------

info "Launching cs_translate..."

if command -v kitty &>/dev/null; then
  info "kitty terminal detected — launching in a new kitty window."
  kitty -- node "$CS_TRANSLATE_JS" &
  disown $! 2>/dev/null || true
  success "cs_translate launched in kitty."
elif command -v cs_translate &>/dev/null; then
  echo -e "${BOLD}Starting cs_translate in this terminal. Press Ctrl+C to stop.${NC}"
  echo ""
  cs_translate
else
  echo -e "${BOLD}Starting cs_translate in this terminal. Press Ctrl+C to stop.${NC}"
  echo ""
  node "$CS_TRANSLATE_JS"
fi
