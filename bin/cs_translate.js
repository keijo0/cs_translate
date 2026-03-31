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
 * - Optionally writes Russian translations to a separate cfg file
 *   (e.g. F9 -> exec translated_ru).
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
 * To send Russian translations into game chat:
 *   1. Run:  cs_translate --enable-game-chat-ru-output
 *   2. Add to CS2 autoexec.cfg or console:  bind "F9" "exec translated_ru"
 *   3. Press F9 in-game whenever you want to send the latest Russian translation.
 *
 * CLI
 * ---
 *   cs_translate                               # start
 *   cs_translate --init-config                # create/refresh config
 *   cs_translate --set-log-path <path>        # set console.log path
 *   cs_translate --set-cfg-path <path>        # set translated.cfg path
 *   cs_translate --set-cfg-ru-path <path>     # set translated_ru.cfg path
 *   cs_translate --enable-game-chat-output
 *   cs_translate --disable-game-chat-output
 *   cs_translate --enable-game-chat-ru-output
 *   cs_translate --disable-game-chat-ru-output
 *   cs_translate --add-exclusion <term>       # add term to exclusion list
 *   cs_translate --remove-exclusion <term>    # remove term from exclusion list
 *   cs_translate --list-exclusions            # show current exclusion list
 *   cs_translate --help
 */

import fs from "fs";
import readline from "readline";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import chalk from "chalk";
import translate from "google-translate-api-x";
import OpenAI from "openai";

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

function getDefaultCfgRuPath() {
  const base = IS_WINDOWS
    ? path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Steam")
    : path.join(os.homedir(), ".local", "share", "Steam");
  return path.join(base, "steamapps", "common", "Counter-Strike Global Offensive", "game", "core", "cfg", "translated_ru.cfg");
}

const CONFIG_DIR = getDefaultConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const defaultConfig = {
  logPath: getDefaultLogPath(),
  cfgPath: getDefaultCfgPath(),
  cfgRuPath: getDefaultCfgRuPath(),
  gameChatOutput: false,
  gameRuChatOutput: false,
  excludedTerms: [],
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
};

let LOG_PATH = "";
let CFG_PATH = "";
let CFG_RU_PATH = "";
let GAME_CHAT_OUTPUT = false;
let GAME_RU_CHAT_OUTPUT = false;
let EXCLUDED_TERMS = [];
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
let OPENAI_MODEL = "gpt-4o-mini";
let LAST_CFG_TEXT = "";
let LAST_CFG_RU_TEXT = "";

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
      cfgRuPath: cfg.cfgRuPath || defaultConfig.cfgRuPath,
      gameChatOutput: typeof cfg.gameChatOutput === "boolean" ? cfg.gameChatOutput : defaultConfig.gameChatOutput,
      gameRuChatOutput: typeof cfg.gameRuChatOutput === "boolean" ? cfg.gameRuChatOutput : defaultConfig.gameRuChatOutput,
      excludedTerms: Array.isArray(cfg.excludedTerms) ? cfg.excludedTerms : [],
      openaiApiKey: typeof cfg.openaiApiKey === "string" ? cfg.openaiApiKey : "",
      openaiModel: typeof cfg.openaiModel === "string" && cfg.openaiModel ? cfg.openaiModel : defaultConfig.openaiModel,
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
      cfgRuPath: cfg.cfgRuPath || defaultConfig.cfgRuPath,
      gameChatOutput: typeof cfg.gameChatOutput === "boolean" ? cfg.gameChatOutput : defaultConfig.gameChatOutput,
      gameRuChatOutput: typeof cfg.gameRuChatOutput === "boolean" ? cfg.gameRuChatOutput : defaultConfig.gameRuChatOutput,
      excludedTerms: Array.isArray(cfg.excludedTerms) ? cfg.excludedTerms : [],
      openaiApiKey: typeof cfg.openaiApiKey === "string" ? cfg.openaiApiKey : "",
      openaiModel: typeof cfg.openaiModel === "string" && cfg.openaiModel ? cfg.openaiModel : defaultConfig.openaiModel,
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
  console.log(`  logPath:             ${merged.logPath}`);
  console.log(`  cfgPath:             ${merged.cfgPath}`);
  console.log(`  cfgRuPath:           ${merged.cfgRuPath}`);
  console.log(`  gameChatOutput:      ${merged.gameChatOutput}`);
  console.log(`  gameRuChatOutput:    ${merged.gameRuChatOutput}`);
  console.log(`  excludedTerms:       ${merged.excludedTerms.length ? merged.excludedTerms.join(", ") : "(none)"}`);
  console.log(`  openaiApiKey:        ${merged.openaiApiKey ? "***" + merged.openaiApiKey.slice(-4) : "(not set — using Google Translate)"}`);
  console.log(`  openaiModel:         ${merged.openaiModel}`);
}

function setupFromConfig() {
  const cfg = loadConfig();
  LOG_PATH = cfg.logPath;
  CFG_PATH = cfg.cfgPath;
  CFG_RU_PATH = cfg.cfgRuPath;
  GAME_CHAT_OUTPUT = cfg.gameChatOutput;
  GAME_RU_CHAT_OUTPUT = cfg.gameRuChatOutput;
  EXCLUDED_TERMS = cfg.excludedTerms || [];
  // Config key takes precedence; environment variable is a secondary fallback
  if (cfg.openaiApiKey) OPENAI_API_KEY = cfg.openaiApiKey;
  if (cfg.openaiModel) OPENAI_MODEL = cfg.openaiModel;
  if (!LOG_PATH) {
    console.error(chalk.red("No logPath configured. Use --set-log-path."));
    process.exit(1);
  }
}

function addExclusionCli(term) {
  const cfg = loadConfig();
  const lower = term.toLowerCase();
  if (cfg.excludedTerms.map((t) => t.toLowerCase()).includes(lower)) {
    console.log(chalk.yellow(`Term already in exclusion list: ${term}`));
    return;
  }
  cfg.excludedTerms.push(term);
  saveConfig(cfg);
  console.log(chalk.green(`Added exclusion: ${term}`));
}

function removeExclusionCli(term) {
  const cfg = loadConfig();
  const lower = term.toLowerCase();
  const before = cfg.excludedTerms.length;
  cfg.excludedTerms = cfg.excludedTerms.filter((t) => t.toLowerCase() !== lower);
  if (cfg.excludedTerms.length === before) {
    console.log(chalk.yellow(`Term not found in exclusion list: ${term}`));
    return;
  }
  saveConfig(cfg);
  console.log(chalk.green(`Removed exclusion: ${term}`));
}

function listExclusionsCli() {
  const cfg = loadConfig();
  console.log(chalk.bold("Translation exclusions:"));
  console.log(chalk.gray("  Built-in (CS2 gaming terms):"));
  for (const t of BUILTIN_EXCLUSIONS) console.log(`    ${t}`);
  console.log(chalk.gray("  User-defined:"));
  if (cfg.excludedTerms.length === 0) {
    console.log(chalk.gray("    (none)"));
  } else {
    for (const t of cfg.excludedTerms) console.log(`    ${t}`);
  }
  console.log(`\n  Config: ${CONFIG_PATH}`);
}

function setOpenAIKeyCli(key) {
  const cfg = loadConfig();
  cfg.openaiApiKey = key.trim();
  saveConfig(cfg);
  console.log(chalk.green("OpenAI API key saved."));
  console.log(chalk.gray("  Translation will now use OpenAI GPT with Google Translate as fallback."));
}

function clearOpenAIKeyCli() {
  const cfg = loadConfig();
  cfg.openaiApiKey = "";
  saveConfig(cfg);
  console.log(chalk.green("OpenAI API key cleared. Translation will use Google Translate."));
}

function setOpenAIModelCli(model) {
  const cfg = loadConfig();
  cfg.openaiModel = model.trim();
  saveConfig(cfg);
  console.log(chalk.green(`OpenAI model set to: ${model.trim()}`));
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
const CYRILLIC_REGEX = /[\u0400-\u04FF]/;

// Languages that use the Cyrillic script — auto-detection for these should be trusted.
const CYRILLIC_LANGUAGES = new Set([
  "ru", "uk", "bg", "sr", "be", "mk", "kk", "mn", "bs", "ce", "os",
]);

// Minimum character length a message must have to attempt translation.
// Very short messages (1–2 chars) cannot be reliably detected or translated.
const MIN_TRANSLATE_LENGTH = 3;

// ---------------------------------------------------------------------------
// Script detection regexes (used to hint at source language)
// ---------------------------------------------------------------------------

const ARABIC_REGEX    = /[\u0600-\u06FF\u0750-\u077F]/;
const CJK_REGEX       = /[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\u30A0-\u30FF\u3040-\u309F]/;
const THAI_REGEX      = /[\u0E00-\u0E7F]/;
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const HEBREW_REGEX    = /[\u0590-\u05FF]/;
const GREEK_REGEX     = /[\u0370-\u03FF]/;
const GEORGIAN_REGEX  = /[\u10A0-\u10FF]/;

function detectScriptHint(text) {
  if (CYRILLIC_REGEX.test(text)) return "ru";
  if (ARABIC_REGEX.test(text))   return "ar";
  if (HEBREW_REGEX.test(text))   return "he";
  if (THAI_REGEX.test(text))     return "th";
  if (DEVANAGARI_REGEX.test(text)) return "hi";
  if (GREEK_REGEX.test(text))    return "el";
  if (GEORGIAN_REGEX.test(text)) return "ka";
  if (CJK_REGEX.test(text))      return "zh";
  return null;
}

// ---------------------------------------------------------------------------
// Built-in CS2 gaming terminology exclusions
// ---------------------------------------------------------------------------

const BUILTIN_EXCLUSIONS = [
  // Match outcomes / general reactions
  "gg", "ez", "gg ez", "gg wp", "ggwp", "nt", "ns", "wp", "bg",
  // Pre-game
  "gl", "hf", "gl hf", "glhf",
  // In-game callouts / strategy
  "rush b", "eco", "force", "save", "ct", "t", "ff",
  // Weapons — rifles
  "awp", "ak", "ak47", "ak-47", "m4", "m4a1", "m4a4", "famas", "galil", "galil ar",
  "sg", "sg553", "aug", "scout", "ssg", "ssg08",
  // Weapons — pistols
  "deagle", "glock", "usp", "usp-s", "p250", "p2000", "tec-9", "tec9",
  "five-seven", "cz", "cz75", "r8",
  // Weapons — smgs / heavy
  "mp5", "mp9", "mac-10", "mac10", "ump", "ump45", "p90", "bizon", "pp-bizon",
  "nova", "xm", "xm1014", "mag7", "mag-7", "negev", "m249",
  // Weapons — knife / misc
  "knife", "zeus", "taser",
  // Grenades
  "flash", "flashes", "smoke", "smokes", "he", "nade", "nades",
  "molly", "molotov", "incendiary", "decoy",
  // Movement / mechanics (universally used in Russian CS2 community)
  "bhop", "bunnyhop", "strafe", "surf", "boost",
  // Hacking / cheat accusations (same word used in Russian)
  "wh", "wallhack", "aimbot", "hack", "hacker", "cheater", "cheats", "cheat",
  "spinbot", "rage", "legit", "closet",
  // Game events / objectives
  "plant", "defuse", "bomb", "kit", "drop", "retake",
  "clutch", "entry", "peek", "flank", "rotate",
  // Map callouts (used verbatim by Russian players)
  "mid", "long", "short", "cat", "jungle", "halls", "tunnel",
  "pit", "banana", "ramp", "van", "window", "bench",
  // Meta / matchmaking
  "mm", "faceit", "esea", "rank", "elo", "adr", "kd", "kda", "mvp", "ace", "rws",
  // Emotes / reactions
  "lol", "lmao", "lmfao", "omg", "wtf", "rip", "oof",
  "lul", "kek", "xd", "pog", "poggers", "ff",
  // Acknowledgements
  "ok", "ok.", "k", "y", "n", "no", "yes", "np", "ty", "thx", "pls", "plz",
  // Common non-translatable short terms
  "go", "go go",
];

// ---------------------------------------------------------------------------
// Translation cache
// ---------------------------------------------------------------------------

const CACHE_MAX_SIZE = 500;
const translationCache = new Map();

function getCacheKey(text, toLang) {
  return `${toLang}:${text}`;
}

function cacheGet(text, toLang) {
  return translationCache.get(getCacheKey(text, toLang));
}

function cacheSet(text, toLang, result) {
  if (translationCache.size >= CACHE_MAX_SIZE) {
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(getCacheKey(text, toLang), result);
}

// ---------------------------------------------------------------------------
// Translation exclusion check
// ---------------------------------------------------------------------------

function isExcluded(text) {
  const lower = text.toLowerCase().trim();
  const allExclusions = [...BUILTIN_EXCLUSIONS, ...EXCLUDED_TERMS.map((t) => t.toLowerCase())];
  return allExclusions.includes(lower);
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(text, detectedLang, targetLang) {
  if (!detectedLang || detectedLang === "unknown") return 0;
  if (detectedLang === targetLang) return 1;
  let score = 0.5;
  if (text.length >= 20) score += 0.2;
  if (text.length >= 50) score += 0.15;
  const scriptHint = detectScriptHint(text);
  if (scriptHint && scriptHint === detectedLang) score += 0.15;
  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Translation with retry + exponential backoff
// ---------------------------------------------------------------------------

const TRANSLATE_MAX_RETRIES = 3;
const TRANSLATE_RETRY_BASE_MS = 500;

async function translateWithRetry(text, opts) {
  let lastErr;
  for (let attempt = 0; attempt < TRANSLATE_MAX_RETRIES; attempt++) {
    try {
      return await translate(text, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < TRANSLATE_MAX_RETRIES - 1) {
        const delay = TRANSLATE_RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// AI translation (OpenAI GPT) — used when OPENAI_API_KEY is configured
// ---------------------------------------------------------------------------

// CS2-context system prompt — teaches the model to handle gaming slang properly
const AI_SYSTEM_PROMPT = `You are a real-time chat translator for Counter-Strike 2 (CS2).

Translate the message to the requested language.

Rules:
- Preserve tone, intensity, and offensiveness (do NOT sanitize insults or profanity).
- Translate slang and swear words accurately (e.g. "mitä vittua" → "what the fuck", not "what's up").
- Preserve all CS2 terms exactly (bhop, awp, rush, smoke, etc.).
- Preserve player names and tags exactly.
- Return ONLY the translated text.
- If already in target language, return unchanged.`;

let _openaiClient = null;

function isOllamaKey(key) {
  return key === "ollama" || key?.startsWith("ollama:");
}

function getOpenAIClient() {
  if (!OPENAI_API_KEY) return null;
  if (!_openaiClient) {
    const isOllama = isOllamaKey(OPENAI_API_KEY);
    _openaiClient = new OpenAI({
      apiKey: isOllama ? "sk-ollama" : OPENAI_API_KEY,
      baseURL: isOllama ? "http://127.0.0.1:11434/v1" : undefined,
    });
  }
  return _openaiClient;
}

async function aiTranslate(text, toLang) {
  if (!OPENAI_API_KEY) return null;

  const langLabel = langName(toLang) || toLang.toUpperCase();
  const messages = [
    { role: "system", content: AI_SYSTEM_PROMPT },
    { role: "user", content: `Translate to ${langLabel}:\n${text}` },
  ];

  // Use raw fetch for Ollama to avoid OpenAI SDK key validation
  if (isOllamaKey(OPENAI_API_KEY)) {
    const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, max_tokens: 256, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (!translated) throw new Error("Empty response from Ollama");
    return translated;
  }

  // Standard OpenAI path
  const client = getOpenAIClient();
  if (!client) return null;
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    max_tokens: 256,
    temperature: 0.2,
  });

  const translated = completion.choices?.[0]?.message?.content?.trim();
  if (!translated) throw new Error("Empty response from OpenAI");
  return translated;
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

function langName(iso) {
  const key = (iso || "").toLowerCase();
  return LANG_MAP[key] || key.toUpperCase() || "UNKNOWN";
}

async function smartTranslate(text, toLang = "en") {
  if (text.trim().length < MIN_TRANSLATE_LENGTH) {
    return { text, from: { language: { iso: toLang } }, __excluded: true, __confidence: 1 };
  }

  if (isExcluded(text)) {
    return { text, from: { language: { iso: toLang } }, __excluded: true, __confidence: 1 };
  }

  const cached = cacheGet(text, toLang);
  if (cached) {
    return { ...cached, __fromCache: true };
  }

  // --- Try AI translation first if an OpenAI key is configured ---
  if (OPENAI_API_KEY) {
    try {
      const aiText = await aiTranslate(text, toLang);
      if (aiText) {
        const scriptHint = detectScriptHint(text) || "unknown";
        const res = {
          text: aiText,
          from: { language: { iso: scriptHint } },
          __aiTranslated: true,
          __confidence: 1,
        };
        cacheSet(text, toLang, res);
        return res;
      }
    } catch (err) {
      // AI failed — log a warning and fall through to Google Translate
      console.log(sym.warn, chalk.yellow(`AI translation failed (${err.message}), falling back to Google Translate.`));
    }
  }

  // --- Google Translate fallback ---
  try {
    const scriptHint = detectScriptHint(text);
    const translateOpts = { to: toLang, tld: "com", autoCorrect: true };

    let res = await translateWithRetry(text, translateOpts);
    const guess = (res.from?.language?.iso || "").toLowerCase();

    if (scriptHint === "ru") {
      // Cyrillic text: trust auto-detect when it returns any known Cyrillic language
      // (Russian, Ukrainian, Bulgarian, Serbian, Belarusian, etc.).
      // Only retry with Russian if auto-detect completely missed the Cyrillic script
      // (e.g. returned "en" or another non-Cyrillic language).
      if (!CYRILLIC_LANGUAGES.has(guess)) {
        try {
          const forced = await translateWithRetry(text, { ...translateOpts, from: "ru" });
          forced.__forcedFrom = "ru";
          res = forced;
        } catch {}
      }
    } else if (scriptHint && guess !== scriptHint) {
      // Non-Cyrillic script: if auto-detect doesn't match the detected script, retry with hint.
      try {
        const hinted = await translateWithRetry(text, { ...translateOpts, from: scriptHint });
        hinted.__forcedFrom = scriptHint;
        res = hinted;
      } catch {}
    }

    const detectedIso = (res.__forcedFrom || res.from?.language?.iso || "unknown").toLowerCase();
    res.__confidence = computeConfidence(text, detectedIso, toLang);

    cacheSet(text, toLang, res);
    return res;
  } catch (err) {
    console.log(sym.warn, chalk.yellow(`Translation failed: ${err.message}`));
    return { text, from: { language: { iso: "unknown" } }, __failed: true, __confidence: 0 };
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
    const safe = text.replace(/[;\n\r"]/g, " ").trim();
    if (!safe || safe === LAST_CFG_TEXT) return;
    LAST_CFG_TEXT = safe;
    fs.writeFileSync(CFG_PATH, `say "${safe}"\n`, "utf8");
    console.log(sym.ok, chalk.green(`cfg written: ${safe}`));
  } catch (err) {
    console.log(sym.warn, chalk.yellow(`Failed to write cfg: ${err.message}`));
  }
}

function sendToGameChatRu(text) {
  if (!GAME_RU_CHAT_OUTPUT) return;
  try {
    const safe = text.replace(/[;\n\r"]/g, " ").trim();
    if (!safe || safe === LAST_CFG_RU_TEXT) return;
    LAST_CFG_RU_TEXT = safe;
    fs.writeFileSync(CFG_RU_PATH, `say "${safe}"\n`, "utf8");
    console.log(sym.ok, chalk.green(`cfg_ru written: ${safe}`));
  } catch (err) {
    console.log(sym.warn, chalk.yellow(`Failed to write cfg_ru: ${err.message}`));
  }
}

// ---------------------------------------------------------------------------
// Auto-translate
// ---------------------------------------------------------------------------

async function autoTranslateToConsole({ team, sender, message }) {
  if (!AUTO_TRANSLATE || !message) return;

  // --- Russian / Cyrillic input path ---
  // Russian messages go to translated_ru.cfg as-is, and are also translated to
  // English for translated.cfg so every message appears there.
  if (CYRILLIC_REGEX.test(message)) {
    sendToGameChatRu(`[${sender} - Russian] ${message}`);
    const resEn = await smartTranslate(message, AUTO_TRANSLATE_TARGET);
    if (!resEn.__excluded && !resEn.__failed) {
      sendToGameChat(`[${sender} - Russian] ${resEn.text}`);
    }
    return;
  }

  // --- Non-Russian input: translate to English first ---
  const res = await smartTranslate(message, AUTO_TRANSLATE_TARGET);

  if (res.__excluded) return;
  if (res.__failed) return;

  const fromIso = (res.__forcedFrom || res.from?.language?.iso || "unknown").toLowerCase();
  const isEnglish = fromIso === AUTO_TRANSLATE_TARGET.toLowerCase();
  const normalizedMessage = message.trim().toLowerCase();

  if (isEnglish) {
    // English input: write as-is to translated.cfg (it is already in the target language).
    sendToGameChat(`[${sender} - English] ${message}`);
    // Translate to Russian for translated_ru.cfg, but skip when the translation
    // comes back unchanged (e.g. "EZ KID" → "EZ KID").
    if (GAME_RU_CHAT_OUTPUT) {
      const resRu = await smartTranslate(message, "ru");
      if (!resRu.__excluded && !resRu.__failed) {
        const translatedRu = (resRu.text || "").trim();
        if (translatedRu && translatedRu.toLowerCase() !== normalizedMessage) {
          sendToGameChatRu(`[${sender} - English] ${translatedRu}`);
        }
      }
    }
    return;
  }

  // --- Other language (e.g. Turkish, Finnish, …) ---
  // Translate to English → translated.cfg
  // Translate to Russian → translated_ru.cfg
  const readableLang = originalLangReadable(res);
  const cacheTag = res.__fromCache ? chalk.gray(" [cached]") : "";
  const aiTag = res.__aiTranslated ? chalk.magenta(" [AI]") : "";
  const confidence = res.__confidence ?? 0;
  const confTag = confidence < 0.5 ? chalk.yellow(` [low confidence: ${Math.round(confidence * 100)}%]`) : "";

  console.log(
    sym.trans,
    chalk.blueBright(`[${team}] ${sender} (${readableLang} → ${AUTO_TRANSLATE_TARGET.toUpperCase()}): `) +
    chalk.gray(res.text) +
    cacheTag +
    aiTag +
    confTag
  );

  sendToGameChat(`[${sender} - ${readableLang}] ${res.text}`);

  if (GAME_RU_CHAT_OUTPUT) {
    const resRu = await smartTranslate(message, "ru");
    if (!resRu.__excluded && !resRu.__failed) {
      const translatedRu = (resRu.text || "").trim();
      if (translatedRu && translatedRu.toLowerCase() !== normalizedMessage) {
        sendToGameChatRu(`[${sender} - ${readableLang}] ${translatedRu}`);
      }
    }
  }
}
// ---------------------------------------------------------------------------
// Log line parser
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
async function handleLine(line) {
  const match = line.match(/\[(CT|T|ALL)\]\s+([^:]+):\s(.+)/);
  if (!match) return;

  const [, team, player, messageRaw] = match;
  const message = (messageRaw || "").trim();

  // Ignore translator-injected relay lines like:
  // [0 [DEAD] - English] hello
  // [0 - Russian] привет
  if (/^\[.* - [^\]]+\]\s+/.test(message)) return;

  // Ignore terminal/log echo lines
  if (/^(💬|🌍|✅|⚠️|❌)\s/.test(message)) return;

  // Ignore nested raw chat lines echoed as plain text
  if (/^\[(ALL|CT|T)\]\s+.*:\s/.test(message)) return;

  const sender = (player || "").trim();

  console.log(
    sym.chat,
    chalk.magentaBright(`[${team}] `) +
    chalk.bold(sender) +
    chalk.white(": ") +
    chalk.white(message)
  );

  await autoTranslateToConsole({ team, sender, message });
}
// Help
// ---------------------------------------------------------------------------

function printCliHelp() {
  console.log("CS2 Chat Auto Translator");
  console.log("");
  console.log("Usage:");
  console.log("  cs_translate                                 # start watching and translating");
  console.log("  cs_translate --init-config                  # create/refresh config.json");
  console.log("  cs_translate --set-log-path <path>          # set CS2 console.log path");
  console.log("  cs_translate --set-cfg-path <path>          # set translated.cfg output path");
  console.log("  cs_translate --set-cfg-ru-path <path>       # set translated_ru.cfg output path");
  console.log("  cs_translate --enable-game-chat-output      # write English translations to cfg file");
  console.log("  cs_translate --disable-game-chat-output     # disable English cfg output (default)");
  console.log("  cs_translate --enable-game-chat-ru-output   # write Russian translations to cfg_ru file");
  console.log("  cs_translate --disable-game-chat-ru-output  # disable Russian cfg output (default)");
  console.log("  cs_translate --add-exclusion <term>         # add term to translation exclusion list");
  console.log("  cs_translate --remove-exclusion <term>      # remove term from exclusion list");
  console.log("  cs_translate --list-exclusions              # show all excluded terms");
  console.log("  cs_translate --set-openai-key <key>         # enable AI translation via OpenAI GPT");
  console.log("  cs_translate --clear-openai-key             # remove OpenAI key, revert to Google Translate");
  console.log("  cs_translate --set-openai-model <model>     # set OpenAI model (default: gpt-4o-mini)");
  console.log("  cs_translate --help                         # show this help");
  console.log("");
  console.log("AI Translation (OpenAI GPT):");
  console.log("  When an OpenAI API key is set, all translations are handled by GPT with a CS2-aware");
  console.log("  system prompt that preserves gaming terms (bhop, wh, awp, rush, smoke, clutch …).");
  console.log("  If the AI request fails, the tool automatically falls back to Google Translate.");
  console.log("  Translations made by the AI are tagged [AI] in the terminal.");
  console.log("  Get a key at: https://platform.openai.com/api-keys");
  console.log("  You can also set the key via the OPENAI_API_KEY environment variable.");
  console.log("");
  console.log("Features:");
  console.log("  - Translation caching: identical messages are not re-translated");
  console.log("  - Retry with backoff: up to 3 attempts on API failure");
  console.log("  - Confidence scoring: [low confidence] tag shown for uncertain translations");
  console.log("  - Script detection: Arabic, CJK, Cyrillic, Devanagari, Georgian, Greek, Hebrew, Thai");
  console.log("  - Exclusion list: common CS2 terms (gg, ez, gl hf …) are never translated");
  console.log("");
  console.log("To send English translations into game chat:");
  console.log("  1. Run:  cs_translate --enable-game-chat-output");
  console.log("  2. In CS2 console or autoexec.cfg:  bind \"F8\" \"exec translated\"");
  console.log("  3. Press F8 in-game to send the latest English translation to chat.");
  console.log("");
  console.log("To send Russian translations into game chat:");
  console.log("  1. Run:  cs_translate --enable-game-chat-ru-output");
  console.log("  2. In CS2 console or autoexec.cfg:  bind \"F9\" \"exec translated_ru\"");
  console.log("  3. Press F9 in-game to send the latest Russian translation to chat.");
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
  if (GAME_RU_CHAT_OUTPUT) {
    try {
      fs.mkdirSync(path.dirname(CFG_RU_PATH), { recursive: true });
    } catch {}
  }

  console.log(sym.start, chalk.bold("CS2 Chat Auto Translator (watching console.log)\n"));
  console.log(chalk.gray("Configuration:"));
  console.log(chalk.white(`  logPath:             ${LOG_PATH}`));
  if (OPENAI_API_KEY) {
    console.log(chalk.white(`  translation:         `) + chalk.magentaBright(`OpenAI GPT (${OPENAI_MODEL}) [AI]`) + chalk.gray(" → Google Translate fallback"));
  } else {
    console.log(chalk.white(`  translation:         `) + chalk.cyan("Google Translate") + chalk.gray("  (set --set-openai-key to enable AI)"));
  }
  console.log(chalk.white(`  gameChatOutput:      ${GAME_CHAT_OUTPUT}`));
  if (GAME_CHAT_OUTPUT) {
    console.log(chalk.white(`  cfgPath:             ${CFG_PATH}`));
    console.log("");
    console.log(chalk.yellow("  ⚡ Game chat output (English) enabled."));
    console.log(chalk.yellow(`  ⚡ Make sure CS2 has:  bind "F8" "exec translated"  in autoexec.cfg`));
  }
  console.log(chalk.white(`  gameRuChatOutput:    ${GAME_RU_CHAT_OUTPUT}`));
  if (GAME_RU_CHAT_OUTPUT) {
    console.log(chalk.white(`  cfgRuPath:           ${CFG_RU_PATH}`));
    console.log("");
    console.log(chalk.yellow("  ⚡ Game chat output (Russian) enabled."));
    console.log(chalk.yellow(`  ⚡ Make sure CS2 has:  bind "F9" "exec translated_ru"  in autoexec.cfg`));
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
if (args[0] === "--set-cfg-ru-path" && args[1]) { updateConfigKey("cfgRuPath", path.resolve(args[1])); process.exit(0); }
if (args[0] === "--enable-game-chat-output") {
  updateConfigKey("gameChatOutput", true);
  console.log(chalk.yellow('Add  bind "F8" "exec translated"  to CS2 autoexec.cfg or console.'));
  process.exit(0);
}
if (args[0] === "--disable-game-chat-output") { updateConfigKey("gameChatOutput", false); process.exit(0); }
if (args[0] === "--enable-game-chat-ru-output") {
  updateConfigKey("gameRuChatOutput", true);
  console.log(chalk.yellow('Add  bind "F9" "exec translated_ru"  to CS2 autoexec.cfg or console.'));
  process.exit(0);
}
if (args[0] === "--disable-game-chat-ru-output") { updateConfigKey("gameRuChatOutput", false); process.exit(0); }
if (args[0] === "--add-exclusion" && args[1]) { addExclusionCli(args[1]); process.exit(0); }
if (args[0] === "--remove-exclusion" && args[1]) { removeExclusionCli(args[1]); process.exit(0); }
if (args[0] === "--list-exclusions") { listExclusionsCli(); process.exit(0); }
if (args[0] === "--set-openai-key" && args[1]) { setOpenAIKeyCli(args[1]); process.exit(0); }
if (args[0] === "--clear-openai-key") { clearOpenAIKeyCli(); process.exit(0); }
if (args[0] === "--set-openai-model" && args[1]) { setOpenAIModelCli(args[1]); process.exit(0); }

start().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
