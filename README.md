<img width="1262" height="478" alt="grafik" src="https://github.com/user-attachments/assets/9babdeeb-8582-4a52-91d1-dba7ad9eba39" />


# cs_translate

`cs_translate` is a small, cross-platform CLI tool that watches your Counter-Strike 2 `console.log` in real time and automatically translates in-game chat messages to a target language (default: English), printing the results in your terminal.

By default it is **read-only** — but it also has an **optional game chat output** mode:

- When disabled (default): it reads `console.log`, detects chat lines, translates them, and prints them to your terminal only.
- When enabled: it also sends each translation into the CS2 game chat so all players can see it, using CS2's built-in **netcon** TCP interface.

---

## Features

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

- 💬 **Optional CS2 game chat output** *(new!)*
  - When enabled, each translation is also sent into the CS2 game chat via the game's built-in **netcon** TCP interface.
  - Game chat output is **disabled by default** — enable it with one command:
    ```bash
    cs_translate --enable-game-chat-output
    ```
  - Requires CS2 to be launched with `-netconport 2121` (or your chosen port).

- 🌍 **Language detection + Cyrillic heuristic**
  - Uses Google’s language detection via `google-translate-api-x`.
  - If the message contains Cyrillic characters but detection is *not* `ru`, it can optionally retry assuming Russian to improve accuracy.

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
   - **If game chat output is enabled**, the translation is also sent into CS2 game chat using `say <[Player - Language] translated text>` via the netcon TCP interface.
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

---

## IMPORTANT: Enable Console Logging in CS2 (`-condebug`)

`cs_translate` depends on CS2 writing its console output to a file.  
You must enable `-condebug`:

1. Open **Steam**.
2. Go to **Library → Right-click on Counter-Strike 2 → Properties…**.
3. Under **Launch Options**, add:
   ```text
   -condebug

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
  "gameChatOutput": false,
  "netconPort": 2121
}
```

On Windows it will look like:

```json
{
  "logPath": "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\console.log"
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

* Enable sending translations into CS2 game chat:

  ```bash
  cs_translate --enable-game-chat-output
  ```

* Disable game chat output (default):

  ```bash
  cs_translate --disable-game-chat-output
  ```

* Change the netcon port (must match `-netconport` in CS2 launch options):

  ```bash
  cs_translate --set-netcon-port 2121
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
  logPath:          /full/path/to/console.log
  gameChatOutput:   false
  netconPort:       2121

Behavior:
  • All detected chat messages are translated to 'EN' and printed here.
  • Game chat output is disabled — translations are shown in this terminal only.
  • To enable in-game chat output run:  cs_translate --enable-game-chat-output
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

To have translations automatically appear in the CS2 game chat for all players to see:

1. Add `-netconport 2121` to your CS2 Steam launch options (alongside `-condebug`):

   ```text
   -condebug -netconport 2121
   ```

2. Enable game chat output in cs_translate:

   ```bash
   cs_translate --enable-game-chat-output
   ```

3. Start cs_translate and CS2. When a foreign-language message is detected and translated, the translation will be sent into game chat as:

   ```
   [Ivan - Russian] Hello, how are you?
   ```

To disable game chat output again:

```bash
cs_translate --disable-game-chat-output
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

```
