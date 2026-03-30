#!/usr/bin/env node
/**
 * CS2 Chat Auto Translator (CLI)
 * ==============================
 *
 * Cross-platform: Linux + Windows
 *
 * What this tool does
 * -------------------
 * - Watches your CS2 `console.log` file in real time.
 * - Detects chat lines such as:
 *       "[CT] PlayerName: message"
 *       "[T]  PlayerName: message"
 *       "[ALL] PlayerName: message"
 * - Automatically translates every chat message to English and prints it.
 * - Optionally writes translations to a CS2 cfg file so you can send them
 *   to game chat by pressing a bound key (e.g. F8 -> exec translated).
 *
 * Requirements
 * ------------
 * - Node.js 18+
 * - google-translate-api-x
 * - chalk
 *
 * CS2 launch options needed:
 *   -condebug
 *
 * To send translations into game chat:
 *   1. Run:  cs_translate --enable-game-chat-output
 *   2. Add to CS2 autoexec.cfg or console:  bind "F8" "exec translated"
 *   3. Press F8 in-game whenever you want to send the latest translation.
 *
 * CLI
 * ---
 *   cs_translate                            # start
 *   cs_translate --init-config             # create/refresh config
 *   cs_translate --set-log-path <path>     # set console.log path
 *   cs_translate --set-cfg-path <path>     # set translated.cfg path
 *   cs_translate --enable-game-chat-output
 *   cs_translate --disable-game-chat-output
 *   cs_translate --help
 */

import fs from "fs";
import readline from "readline";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import chalk from "chalk";
import translate from "google-translate-api-x";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const IS_WINDOWS = process.platform === "win32";

// ---------------------------------------------------------------------------
// Config paths
// ---------------------------------------------------------------------------

function getDefaultConfigDir() {
  if (IS_WINDOWS) {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "cs2-chat-translator");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg || path.join(os.homedir(), ".config"), "cs2-chat-translator");
}

function getDefaultLogPath() {
  const base = IS_WINDOWS
    ? path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Steam")
    : path.join(os.homedir(), ".local", "share", "Steam");
  return path.join(base, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "console.log");
}

function getDefaultCfgPath() {
  const base = IS_WINDOWS
    ? path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Steam")
    : path.join(os.homedir(), ".local", "share", "Steam");
  return path.join(base, "steamapps", "common", "Counter-Strike Global Offensive", "game", "csgo", "cfg", "translated.cfg");
}

const CONFIG_DIR = getDefaultConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const defaultConfig = {
  logPath: getDefaultLogPath(),
  cfgPath: getDefaultCfgPath(),
  gameChatOutput: false,
};

let LOG_PATH = "";
let CFG_PATH = "";
let GAME_CHAT_OUTPUT = false;

// ---------------------------------------------------------------------------
// Config load/save
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return { ...defaultConfig };
    const txt = fs.readFileSync(CONFIG_PATH, "utf8").trim();
    if (!txt) return { ...defaultConfig };
    const cfg = JSON.parse(txt);
    return {
      logPath: cfg.logPath || defaultConfig.logPath,
      cfgPath: cfg.cfgPath || defaultConfig.cfgPath,
      gameChatOutput: typeof cfg.gameChatOutput === "boolean" ? cfg.gameChatOutput : defaultConfig.gameChatOutput,
    };
  } catch (err) {
    console.error(chalk.red(`Failed to load config: ${err.message}`));
    return { ...defaultConfig };
  }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    const merged = {
      logPath: cfg.logPath || defaultConfig.logPath,
      cfgPath: cfg.cfgPath || defaultConfig.cfgPath,
      gameChatOutput: typeof cfg.gameChatOutput === "boolean" ? cfg.gameChatOutput : defaultConfig.gameChatOutput,
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  } catch (err) {
    console.error(chalk.red(`Failed to write config: ${err.message}`));
    process.exit(1);
  }
}

function updateConfigKey(key, value) {
  const cfg = loadConfig();
  cfg[key] = value;
  const merged = saveConfig(cfg);
  console.log(chalk.green(`Config updated (${key}):`));
  console.log(`  ${CONFIG_PATH}`);
  console.log(`  ${key}: ${merged[key]}`);
}

function initConfigCli() {
  const merged = saveConfig(loadConfig());
  console.log(chalk.green("Config initialized/updated:"));
  console.log(`  ${CONFIG_PATH}`);
  console.log(`  logPath:          ${merged.logPath}`);
  console.log(`  cfgPath:          ${merged.cfgPath}`);
  console.log(`  gameChatOutput:   ${merged.gameChatOutput}`);
}

function setupFromConfig() {
  const cfg = loadConfig();
  LOG_PATH = cfg.logPath;
  CFG_PATH = cfg.cfgPath;
  GAME_CHAT_OUTPUT = cfg.gameChatOutput;
  if (!LOG_PATH) {
    console.error(chalk.red("No logPath configured. Use --set-log-path."));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Terminal symbols
// ---------------------------------------------------------------------------

const sym = {
  start: chalk.cyan("🚀"),
  ok:    chalk.green("✅"),
  warn:  chalk.yellow("⚠️"),
  err:   chalk.red("❌"),
  chat:  chalk.magenta("💬"),
  trans: chalk.blueBright("🌍"),
};

// ---------------------------------------------------------------------------
// Language map
// ---------------------------------------------------------------------------

const LANG_MAP = {
  af:"Afrikaans", sq:"Albanian", am:"Amharic", ar:"Arabic", hy:"Armenian",
  az:"Azerbaijani", eu:"Basque", be:"Belarusian", bn:"Bengali", bs:"Bosnian",
  bg:"Bulgarian", ca:"Catalan", ceb:"Cebuano", ny:"Chichewa", zh:"Chinese",
  zh_cn:"Chinese (Simplified)", zh_tw:"Chinese (Traditional)", co:"Corsican",
  hr:"Croatian", cs:"Czech", da:"Danish", nl:"Dutch", en:"English",
  eo:"Esperanto", et:"Estonian", tl:"Filipino", fi:"Finnish", fr:"French",
  fy:"Frisian", gl:"Galician", ka:"Georgian", de:"German", el:"Greek",
  gu:"Gujarati", ht:"Haitian Creole", ha:"Hausa", haw:"Hawaiian", he:"Hebrew",
  hi:"Hindi", hmn:"Hmong", hu:"Hungarian", is:"Icelandic", ig:"Igbo",
  id:"Indonesian", ga:"Irish", it:"Italian", ja:"Japanese", jw:"Javanese",
  kn:"Kannada", kk:"Kazakh", km:"Khmer", rw:"Kinyarwanda", ko:"Korean",
  ku:"Kurdish (Kurmanji)", ky:"Kyrgyz", lo:"Lao", la:"Latin", lv:"Latvian",
  lt:"Lithuanian", lb:"Luxembourgish", mk:"Macedonian", mg:"Malagasy",
  ms:"Malay", ml:"Malayalam", mt:"Maltese", mi:"Maori", mr:"Marathi",
  mn:"Mongolian", my:"Myanmar (Burmese)", ne:"Nepali", no:"Norwegian",
  or:"Odia (Oriya)", ps:"Pashto", fa:"Persian", pl:"Polish", pt:"Portuguese",
  pa:"Punjabi", ro:"Romanian", ru:"Russian", sm:"Samoan", gd:"Scots Gaelic",
  sr:"Serbian", st:"Sesotho", sn:"Shona", sd:"Sindhi", si:"Sinhala",
  sk:"Slovak", sl:"Slovenian", so:"Somali", es:"Spanish", su:"Sundanese",
  sw:"Swahili", sv:"Swedish", tg:"Tajik", ta:"Tamil", tt:"Tatar", te:"Telugu",
  th:"Thai", tr:"Turkish", tk:"Turkmen", uk:"Ukrainian", ur:"Urdu",
  ug:"Uyghur", uz:"Uzbek", vi:"Vietnamese", cy:"Welsh", xh:"Xhosa",
  yi:"Yiddish", yo:"Yoruba", zu:"Zulu"
};

const AUTO_TRANSLATE = true;
const AUTO_TRANSLATE_TARGET = "en";
const PREFER_RU_FOR_CYRILLIC = true;
const CYRILLIC_REGEX = /[\u0400-\u04FF]/;

function langName(iso) {
  const key = (iso || "").toLowerCase();
  return LANG_MAP[key] || key.toUpperCase() || "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

async function smartTranslate(text, toLang = "en") {
  try {
    let res = await translate(text, { to: toLang });
    const guess = (res.from?.language?.iso || "").toLowerCase();
    if (PREFER_RU_FOR_CYRILLIC && CYRILLIC_REGEX.test(text) && guess !== "ru") {
      try {
        const forced = await translate(text, { from: "ru", to: toLang });
        forced.__forcedFrom = "ru";
        return forced;
      } catch {}
    }
    return res;
  } catch (err) {
    console.log(sym.warn, chalk.yellow(`Translation failed: ${err.message}`));
    return { text, from: { language: { iso: "unknown" } } };
  }
}

function originalLangReadable(res) {
  const iso = (res.__forcedFrom || res.from?.language?.iso || "unknown").toLowerCase();
  return langName(iso);
}

// ---------------------------------------------------------------------------
// Game chat output via cfg file
// ---------------------------------------------------------------------------

function sendToGameChat(text) {
  if (!GAME_CHAT_OUTPUT) return;
  try {
    // Sanitize: strip characters that would break the say command
    const safe = text.replace(/[;\n\r"]/g, " ").trim();
    fs.writeFileSync(CFG_PATH, `say "${safe}"\n`, "utf8");
    console.log(sym.ok, chalk.green(`cfg written: ${safe}`));
  } catch (err) {
    console.log(sym.warn, chalk.yellow(`Failed to write cfg: ${err.message}`));
  }
}

// ---------------------------------------------------------------------------
// Auto-translate
// ---------------------------------------------------------------------------

async function autoTranslateToConsole({ team, sender, message }) {
  if (!AUTO_TRANSLATE || !message) return;

  const res = await smartTranslate(message, AUTO_TRANSLATE_TARGET);
  const fromIso = (res.__forcedFrom || res.from?.language?.iso || "unknown").toLowerCase();

  if (fromIso === AUTO_TRANSLATE_TARGET.toLowerCase()) return;

  const readableLang = originalLangReadable(res);
  console.log(
    sym.trans,
    chalk.blueBright(`[${team}] ${sender} (${readableLang} → ${AUTO_TRANSLATE_TARGET.toUpperCase()}): `) +
    chalk.gray(res.text)
  );

  sendToGameChat(`[${sender} - ${readableLang}] ${res.text}`);
}

// ---------------------------------------------------------------------------
// Log line parser
// ---------------------------------------------------------------------------

async function handleLine(line) {
  const match = line.match(/\[(CT|T|ALL)\]\s+([^:]+):\s(.+)/);
  if (!match) return;

  const [, team, player, messageRaw] = match;
  const message = (messageRaw || "").trim();
  const sender = (player || "").trim();

  console.log(
    sym.chat,
    chalk.magentaBright(`[${team}] `) + chalk.bold(sender) + chalk.white(": ") + chalk.white(message)
  );

  await autoTranslateToConsole({ team, sender, message });
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printCliHelp() {
  console.log("CS2 Chat Auto Translator");
  console.log("");
  console.log("Usage:");
  console.log("  cs_translate                              # start watching and translating");
  console.log("  cs_translate --init-config               # create/refresh config.json");
  console.log("  cs_translate --set-log-path <path>       # set CS2 console.log path");
  console.log("  cs_translate --set-cfg-path <path>       # set translated.cfg output path");
  console.log("  cs_translate --enable-game-chat-output   # write translations to cfg file");
  console.log("  cs_translate --disable-game-chat-output  # disable cfg output (default)");
  console.log("  cs_translate --help                      # show this help");
  console.log("");
  console.log("To send translations into game chat:");
  console.log("  1. Run:  cs_translate --enable-game-chat-output");
  console.log("  2. In CS2 console or autoexec.cfg:  bind \"F8\" \"exec translated\"");
  console.log("  3. Press F8 in-game to send the latest translation to chat.");
  console.log("");
  console.log(`Config: ${CONFIG_PATH}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function start() {
  setupFromConfig();

  if (!fs.existsSync(LOG_PATH)) {
    console.error(chalk.red(`❌ console.log not found: ${LOG_PATH}`));
    console.error("Make sure CS2 is running with '-condebug'.");
    console.error("Fix with:  cs_translate --set-log-path /path/to/console.log");
    process.exit(1);
  }

  // Ensure cfg directory exists if game chat output is enabled
  if (GAME_CHAT_OUTPUT) {
    try {
      fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true });
    } catch {}
  }

  console.log(sym.start, chalk.bold("CS2 Chat Auto Translator (watching console.log)\n"));
  console.log(chalk.gray("Configuration:"));
  console.log(chalk.white(`  logPath:          ${LOG_PATH}`));
  console.log(chalk.white(`  gameChatOutput:   ${GAME_CHAT_OUTPUT}`));
  if (GAME_CHAT_OUTPUT) {
    console.log(chalk.white(`  cfgPath:          ${CFG_PATH}`));
    console.log("");
    console.log(chalk.yellow("  ⚡ Game chat output enabled."));
    console.log(chalk.yellow(`  ⚡ Make sure CS2 has:  bind "F8" "exec translated"  in autoexec.cfg`));
  }
  console.log("");

  fs.watchFile(LOG_PATH, { interval: 500 }, (curr, prev) => {
    if (curr.size <= prev.size) return;

    const stream = fs.createReadStream(LOG_PATH, {
      start: prev.size,
      end: curr.size,
      encoding: "utf8",
    });

    const rl = readline.createInterface({ input: stream });
    rl.on("line", (line) => {
      Promise.resolve(handleLine(line)).catch((err) => {
        console.error(chalk.red("Line handling error:"), err);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) { printCliHelp(); process.exit(0); }
if (args[0] === "--init-config") { initConfigCli(); process.exit(0); }
if (args[0] === "--set-log-path" && args[1]) { updateConfigKey("logPath", path.resolve(args[1])); process.exit(0); }
if (args[0] === "--set-cfg-path" && args[1]) { updateConfigKey("cfgPath", path.resolve(args[1])); process.exit(0); }
if (args[0] === "--enable-game-chat-output") {
  updateConfigKey("gameChatOutput", true);
  console.log(chalk.yellow('Add  bind "F8" "exec translated"  to CS2 autoexec.cfg or console.'));
  process.exit(0);
}
if (args[0] === "--disable-game-chat-output") { updateConfigKey("gameChatOutput", false); process.exit(0); }

start().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
