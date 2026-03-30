<img width="1262" height="478" alt="grafik" src="https://github.com/user-attachments/assets/9babdeeb-8582-4a52-91d1-dba7ad9eba39" />


# cs_translate

`cs_translate` is a small, cross-platform CLI tool that watches your Counter-Strike 2 `console.log` in real time and automatically translates in-game chat messages to a target language (default: English), printing the results in your terminal.

By default it is **read-only** — but it also has an **optional game chat output** mode:

- When disabled (default): it reads `console.log`, detects chat lines, translates them, and prints them to your terminal only.
- When enabled: it also sends each translation into the CS2 game chat so all players can see it, using CS2's built-in **netcon** TCP interface.

---

## Features

- 🤖 **AI-powered translation (OpenAI GPT)**
  - When an OpenAI API key is configured, all translations are handled by **GPT** instead of Google Translate.
  - Uses a CS2-aware system prompt that instructs the model to:
    - Preserve gaming terms exactly (`bhop`, `wh`, `awp`, `rush`, `smoke`, `clutch`, `gg`, …)
    - Return only the translated text — no explanations or commentary
  - AI translations are tagged **`[AI]`** in the terminal output.
  - If the AI call fails for any reason, the tool **automatically falls back to Google Translate** — zero downtime.
  - Enable with one command:
    ```bash
    cs_translate --set-openai-key sk-...your-key...
    ```
  - You can also set the key via the `OPENAI_API_KEY` environment variable.
  - Change the model (default: `gpt-4o-mini`):
    ```bash
    cs_translate --set-openai-model gpt-4o
    ```
  - Remove the key to revert to Google Translate:
    ```bash
    cs_translate --clear-openai-key
    ```

- 🧠 **Automatic chat translation**
  - Watches `console.log` for chat lines like:
    - `[CT] PlayerName: message`
    - `[T] PlayerName: message`
    - `[ALL] PlayerName: message`
  - Translates each chat message to a target language (default: `en`).
  - Prints readable logs, for example:
    ```text
    💬 [T] Player123: Привет, как дела?
    🌍 [T] Player123 (Russian → EN): Hello, how are you?
    ```

- 💬 **Optional CS2 game chat output (cfg file)**
  - When enabled, each English translation is written to `translated.cfg` so you can send it to game chat by pressing a key you bind in CS2.
  - Game chat output is **disabled by default** — enable it with one command:
    ```bash
    cs_translate --enable-game-chat-output
    ```
  - Then bind a key in CS2 (autoexec.cfg or console):
    ```text
    bind "F8" "exec translated"
    ```
  - Press **F8** in-game to send the latest English translation to chat.
  - The cfg output path defaults to `<Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/translated.cfg` and can be overridden:
    ```bash
    cs_translate --set-cfg-path /custom/path/translated.cfg
    ```

- 🇷🇺 **Russian translation output**
  - When enabled, each message is also translated to Russian and written to `translated_ru.cfg`.
  - Useful for Russian-speaking communities who want a local translation alongside the English one.
  - Enable with:
    ```bash
    cs_translate --enable-game-chat-ru-output
    ```
  - Then bind a key in CS2:
    ```text
    bind "F9" "exec translated_ru"
    ```
  - Press **F9** in-game to send the latest Russian translation to chat.
  - The Russian cfg path defaults to `<Steam>/steamapps/common/Counter-Strike Global Offensive/game/core/cfg/translated_ru.cfg` and can be overridden:
    ```bash
    cs_translate --set-cfg-ru-path /custom/path/translated_ru.cfg
    ```

- 🌍 **Improved language detection**
  - Uses Google's language detection via `google-translate-api-x`.
  - Script-based detection hints for 8 writing systems: **Arabic, CJK (Chinese/Japanese/Korean), Cyrillic, Devanagari, Georgian, Greek, Hebrew, Thai**.
  - When detected language doesn't match the script, the tool retries with the correct source language for better accuracy.

- ⚡ **Translation caching**
  - Identical messages are cached in memory (up to 500 entries) and never re-translated.
  - Cached results are shown with a `[cached]` tag in the terminal.
  - Reduces redundant API calls and prevents rate limiting.

- 🔁 **Retry with exponential backoff**
  - Transient API failures are automatically retried up to 3 times with exponential backoff (500 ms → 1 s → 2 s).
  - Only reports failure after all retries are exhausted.

- 📊 **Confidence scoring**
  - Each translation is scored for reliability based on text length and script-detection agreement.
  - Translations with less than 50% confidence are tagged `[low confidence: X%]` in the terminal.

- 🎮 **CS2 gaming terminology exclusion list**
  - Common CS2 abbreviations (`gg`, `ez`, `gl hf`, `rush b`, `eco`, `awp`, …) are never sent to the translation API.
  - Users can add their own exclusions (player names, clan tags, custom slang):
    ```bash
    cs_translate --add-exclusion "yourterm"
    cs_translate --list-exclusions
    cs_translate --remove-exclusion "yourterm"
    ```

- 📦 **Cross-platform**
  - Works on **Linux** and **Windows** (Node.js-based).
  - No platform-specific dependencies beyond Node itself.

- ⚙️ **Simple config**
  - Config stored in a small `config.json` file.
  - Managed via CLI helpers — no manual editing required.

---

## How It Works

1. CS2 must be started with the launch option `-condebug`.  
   That makes the game write console output to `console.log`.
2. `cs_translate` tails that file (using `fs.watchFile`) and parses new lines.
3. For each line matching the chat pattern `"[TEAM] Player: message"`:
   - It logs the original message to the terminal.
   - It auto-translates the message to the configured target language (default `en`).
   - If the source language is different from the target, it prints the translation.
   - **If game chat output is enabled**, the translation is written to `translated.cfg`; press the bound key (e.g. F8) in CS2 to send it to chat.
4. Non-chat lines are ignored.

---

## Requirements

- **OS**
  - Linux
  - Windows

- **Runtime**
  - Node.js 18+ (or newer)
  - Internet access (for Google Translate)

- **Node dependencies (handled via `npm install`)**
  - `google-translate-api-x` (translation)
  - `chalk` (colored terminal output)
  - `openai` (optional AI translation — only used when an OpenAI API key is configured)

---

## IMPORTANT: Enable Console Logging in CS2 (`-condebug`)

`cs_translate` depends on CS2 writing its console output to a file.  
You must enable `-condebug`:

1. Open **Steam**.
2. Go to **Library → Right-click on Counter-Strike 2 → Properties…**.
3. Under **Launch Options**, add:
   ```text
   -condebug
   ```
4. Start CS2 once so that the `console.log` file is created.

Typical default locations for `console.log` are:

* **Linux (Steam / Proton)**

  ```text
  ~/.local/share/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/console.log
  ```

* **Windows (default Steam path, may differ on your system)**

  ```text
  C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\console.log
  ```

You can (and should) override this path in the `cs_translate` config if your setup differs.

---

## Configuration

`cs_translate` stores its settings in a simple JSON file containing only the `logPath`.

### Config file location

* **Linux**

  * If `$XDG_CONFIG_HOME` is set:

    ```text
    $XDG_CONFIG_HOME/cs_translate/config.json
    ```
  * Otherwise:

    ```text
    ~/.config/cs_translate/config.json
    ```

* **Windows**

  * Uses `%APPDATA%`:

    ```text
    %APPDATA%\cs_translate\config.json
    ```
  * Example:

    ```text
    C:\Users\YourName\AppData\Roaming\cs_translate\config.json
    ```

### Example `config.json`

```json
{
  "logPath": "/full/path/to/your/cs2/console.log",
  "cfgPath": "/full/path/to/csgo/cfg/translated.cfg",
  "cfgRuPath": "/full/path/to/csgo/cfg/translated_ru.cfg",
  "gameChatOutput": false,
  "gameRuChatOutput": false,
  "excludedTerms": [],
  "openaiApiKey": "",
  "openaiModel": "gpt-4o-mini"
}
```

On Windows it will look like:

```json
{
  "logPath": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\console.log",
  "cfgPath": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg\\translated.cfg",
  "cfgRuPath": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\core\\cfg\\translated_ru.cfg",
  "gameChatOutput": false,
  "gameRuChatOutput": false,
  "excludedTerms": [],
  "openaiApiKey": "",
  "openaiModel": "gpt-4o-mini"
}
```

(Backslashes are automatically escaped in JSON.)

### CLI helpers

You rarely need to edit `config.json` by hand. The CLI provides helpers:

* Initialize or refresh the config file:

  ```bash
  cs_translate --init-config
  ```

* Set the path to `console.log`:

  ```bash
  cs_translate --set-log-path /full/path/to/console.log
  ```

  On Windows PowerShell / CMD:

  ```powershell
  cs_translate --set-log-path "C:\full\path\to\console.log"
  ```

* Enable sending English translations to CS2 game chat via cfg file:

  ```bash
  cs_translate --enable-game-chat-output
  ```

* Disable English game chat output (default):

  ```bash
  cs_translate --disable-game-chat-output
  ```

* Set the path to `translated.cfg` (English output):

  ```bash
  cs_translate --set-cfg-path /path/to/csgo/cfg/translated.cfg
  ```

* Enable sending Russian translations to CS2 game chat via cfg file:

  ```bash
  cs_translate --enable-game-chat-ru-output
  ```

* Disable Russian game chat output (default):

  ```bash
  cs_translate --disable-game-chat-ru-output
  ```

* Set the path to `translated_ru.cfg` (Russian output):

  ```bash
  cs_translate --set-cfg-ru-path /path/to/csgo/cfg/translated_ru.cfg
  ```

* Manage OpenAI API key for AI-powered translation:

  ```bash
  cs_translate --set-openai-key sk-...your-key...
  cs_translate --clear-openai-key
  cs_translate --set-openai-model gpt-4o
  ```

* Manage translation exclusions (custom terms that should never be translated):

  ```bash
  cs_translate --add-exclusion "yourterm"
  cs_translate --remove-exclusion "yourterm"
  cs_translate --list-exclusions
  ```

* Show help:

  ```bash
  cs_translate --help
  ```

---

## Installation

### Arch Linux / AUR

If you are on Arch or an Arch-based distro (EndeavourOS, Artix, etc.), you can install `cs_translate` from the AUR:

```bash
yay -S cs_translate
# or
paru -S cs_translate
```

This will:

* install the Node app under `/usr/lib/cs_translate`
* create a launcher script at `/usr/bin/cs_translate`

After installation:

```bash
cs_translate --init-config
cs_translate
```

### Manual installation (generic Node.js)

If you want to run it directly from source:

1. Clone the repo:

   ```bash
   git clone https://github.com/MeckeDev/cs_translate.git
   cd cs_translate
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Make sure the CLI script is executable (on Linux/macOS):

   ```bash
   chmod +x bin/cs_translate.js
   ```

4. Run directly:

   ```bash
   node bin/cs_translate.js --help
   node bin/cs_translate.js --init-config
   node bin/cs_translate.js
   ```

Or globally link it as `cs_translate`:

```bash
npm link
cs_translate --help
```

---

## Usage

### 1. First-time setup

1. Ensure CS2 is started with `-condebug` (see above).

2. Initialize the config:

   ```bash
   cs_translate --init-config
   ```

   This will create a `config.json` with a best-guess `logPath`.

3. If necessary, fix the `logPath`:

   ```bash
   cs_translate --set-log-path /full/path/to/console.log
   ```

### 2. Run the translator

Start the tool in a terminal:

```bash
cs_translate
```

You should see a banner similar to:

```text
🚀 CS2 Chat Auto Translator (watching console.log)

Configuration:
  logPath:             /full/path/to/console.log
  translation:         Google Translate  (set --set-openai-key to enable AI)
  gameChatOutput:      false
  gameRuChatOutput:    false
```

Leave this terminal open while you play CS2.

When players chat in game, you’ll see output like:

```text
💬 [T] Ivan: Привет, как дела?
🌍 [T] Ivan (Russian → EN): Hello, how are you?

💬 [ALL] Juan: buenos dias amigos
🌍 [ALL] Juan (Spanish → EN): good morning friends
```

If the source language is already English (or your configured target), the tool may skip printing a translation to keep noise low.

### 3. (Optional) Enable game chat output

To have English translations appear in the CS2 game chat:

1. Enable game chat output in cs_translate:

   ```bash
   cs_translate --enable-game-chat-output
   ```

2. In CS2, bind a key to execute the translated cfg (add to `autoexec.cfg` or run in the CS2 console):

   ```text
   bind "F8" "exec translated"
   ```

3. Press **F8** in-game whenever you want to send the latest English translation to chat:

   ```
   [Ivan - Russian] Hello, how are you?
   ```

To disable game chat output again:

```bash
cs_translate --disable-game-chat-output
```

### 4. (Optional) Enable Russian game chat output

To also send Russian translations into CS2 game chat:

1. Enable Russian game chat output:

   ```bash
   cs_translate --enable-game-chat-ru-output
   ```

2. In CS2, bind a key to execute the Russian translated cfg:

   ```text
   bind "F9" "exec translated_ru"
   ```

3. Press **F9** in-game to send the latest Russian translation to chat.

To disable:

```bash
cs_translate --disable-game-chat-ru-output
```

---

## Troubleshooting

### `❌ console.log not found: ...`

If you see:

```text
❌ console.log not found: /some/path/console.log
Make sure CS2 is running with '-condebug' and that the path is correct.
```

Check:

1. CS2 launch options include `-condebug`.
2. `console.log` actually exists at the specified path.
3. The path in your config is correct.

You can fix the path with:

```bash
cs_translate --set-log-path /correct/path/to/console.log
```

### No translations appear

* Make sure there is actual chat activity in your CS2 match.
* Ensure `AUTO_TRANSLATE` is enabled in the code (by default it is).
* Verify that your system has internet access for the translation API.
* If only English appears in chat, the tool might skip translations because source = target.

### High latency or rate limits

The tool relies on `google-translate-api-x`, which scrapes the public Translate API. In rare cases:

* It may be slow or temporarily rate-limited.
* You may see warnings like `Translation failed: ...` in the terminal.

In those cases, the tool will fall back to printing the original text.

---

## Development

To hack on `cs_translate`:

```bash
git clone https://github.com/MeckeDev/cs_translate.git
cd cs_translate
npm install

# Run with debug logs
node bin/cs_translate.js --init-config
node bin/cs_translate.js
```

You can:

* Change the target language.
* Adjust the heuristics (e.g. for Cyrillic).
* Add additional filtering, logging, or custom output formats.

If you publish a modified version, please respect the project’s license.

---

## License

`cs_translate` is open source software.
See the `LICENSE` file in the repository for full license details.
