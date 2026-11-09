# Ather — design spec

Date: 2026-10-28 · Status: draft for review

## 1. Goal

A college project: a free, local-AI desktop assistant for Windows with a
friendly animated face, matching the features advertised on heytaby.com
(free and Premium tiers), built as original code, packaged as an `.exe`
installer.

- **Who:** the student (demo + report), running on this laptop
  (i5-13420H, 16 GB RAM, RTX 4050 6 GB, Windows 11).
- **Success:** the installed `.exe` launches, the face drops down from the
  top of the screen, and every feature in section 4 works offline (except
  the ones that by nature need the internet: web search, email, calendar
  feeds) with no account and no subscription.
- **Name:** "Ather" (from the project folder). No Taby code, artwork, name
  or branding is reused; only the same free, open-source building blocks.

## 2. What REA showed about Taby (reference only)

Electron + React app. The AI runs in llama.cpp `llama-server` (OpenAI-style
`/v1/chat/completions`, local port) with Qwen 3.5 4B GGUF. About 60 named
tools (`tasks.create`, `notes.create`, `reminders.create`, `habits.create`,
`focus.start`, `schedule.create`, `taby.undo`, …). Storage is `node:sqlite`.
Speech to text: Parakeet TDT 0.6B ONNX. Text to speech: Kokoro-82M via
`kokoro-js` and Supertonic-3. Search embeddings: EmbeddingGemma-300M ONNX.
A local MCP server lets Claude/Codex control it. A frameless "notch" window
at the top of the screen opens on hover or Ctrl+Space.

## 3. Architecture

```
Electron main process (Node 24)
├── brain/      Ollama client (OpenAI-compatible API) + tool-calling loop
├── tools/      one file per area: tasks, notes, reminders, habits, focus,
│               calendar, mail, search, images, web, personality, undo
├── store/      node:sqlite database + migrations
├── speech/     worker: Whisper STT, Kokoro TTS (transformers.js / kokoro-js)
├── search/     file + photo index: text embeddings, CLIP image embeddings
├── imaging/    OCR (tesseract.js), face detection, blur, image generation
├── mcp/        local MCP server (official SDK, localhost only)
├── scheduler/  reminder / habit / focus notifications
└── windows/    notch window, main window, tray, global shortcuts
Renderer (React + Vite)
├── notch/      animated face, text box, mic button, answer bubble
└── app/        Home, Tasks, Notes, Habits, Calendar, Inbox, Search,
                Image editor, Settings, Computer check
```

- **AI runtime: Ollama** (already installed, OpenAI-compatible, does tool
  calling and images). Using the same API shape as Taby means `llama-server`
  could replace it later with no code change.
- Every action the AI takes goes through one **tool registry**: name,
  JSON-schema input, handler, undo. The chat UI, the MCP server and the
  settings screens all call the same handlers.
- Heavy ML (speech, CLIP, OCR) runs in a **utility process**, so the UI never
  freezes.

## 4. Features (from the website) and how each is built

| # | Feature on heytaby.com | Ather implementation |
|---|---|---|
| 1 | Face at top of screen, hover / Ctrl+Space | Frameless transparent always-on-top window; cursor polling at the top edge; global shortcut |
| 2 | Type it | Notch text box + full chat view, streaming answers |
| 3 | Local AI, works with Wi-Fi off | Ollama `qwen3.5:4b` (vision); fallback `gemma3:4b` (already installed) |
| 4 | Talk to it | Push-to-talk mic → Whisper small (multilingual, ~99 languages) |
| 5 | It talks back | Kokoro-82M; mouth animation driven by audio loudness |
| 6 | Tasks, notes, habits, focus, reminders | SQLite + tools; Windows notifications; undo |
| 7 | "When do I focus best?" / patterns | Stats from completion + focus history; `history.query` tool |
| 8 | Inbox sorted | IMAP (Gmail/Outlook app password), AI marks "needs you" |
| 9 | Calendar (Google, Outlook, Apple) | Built-in local calendar (AI can add events) + read-only sync of each provider's private iCal link |
| 10 | Smart search: photos, notes, files | Index chosen folders: text files + notes via `nomic-embed-text`, photos via CLIP |
| 11 | Image editor: blur emails, faces, names | OCR finds emails/names, face detector finds faces, blur applied, save copy |
| 12 | Understand images | Attach/paste an image; Qwen vision answers |
| 13 | Generate images | stable-diffusion.cpp (CUDA build) + SD-Turbo |
| 14 | Speech to text: type with your voice in any app | Global hotkey → record → transcribe → paste into focused app |
| 15 | Web search, reading pages | DuckDuckGo HTML search + page fetch → AI summarises (needs internet) |
| 16 | Uses the browser for you | Opens sites/searches in the default browser (no form filling, see 6) |
| 17 | Personalities | Normal, Brother, Anime Girl, Butler, Italian, Russian: system prompts + voices |
| 18 | Connect Claude, Codex, your own agent | Local MCP server, toggle in Settings, localhost only |
| 19 | Speaks your language | AI answers in the user's language; listening ~99 languages; speech in Kokoro's 8 |
| 20 | Hide the face | Settings: face / text-field-only mode |
| 21 | Can my computer run it? | Settings page: RAM, GPU, VRAM, disk, with a verdict |
| 22 | Free, no account | No sign-in anywhere |

## 5. Models to download (all free)

| Use | Model | Approx. size |
|---|---|---|
| Brain + vision | Ollama `qwen3.5:4b` | ~3.5 GB |
| Listening | `onnx-community/whisper-small` (q8) | ~250 MB |
| Voice | `onnx-community/Kokoro-82M-v1.0-ONNX` (q8) | ~90 MB |
| Text search | Ollama `nomic-embed-text` | already installed |
| Photo search | `Xenova/clip-vit-base-patch32` | ~150 MB |
| OCR | tesseract.js English data | ~15 MB |
| Face detection | small ONNX face detector (UltraFace class) | ~2 MB |
| Image generation | SD-Turbo GGUF + stable-diffusion.cpp CUDA build | ~2.5 GB |

Total about 6.5 GB, downloaded on first run with a progress screen (not
inside the `.exe`).

## 6. Not included, and why

- **Physical Taby desk device:** needs the hardware.
- **Phone app, cloud web app, Premium billing:** everything here is free and local already.
- **Video generation, "does things in your other apps", "shows things on your
  screen", custom pages:** Taby itself lists these as "coming soon".
- **Writing to Google/Outlook calendars:** needs an OAuth app registered by
  the user with Google/Microsoft. Reading works via iCal links; new events go
  to Ather's own calendar.
- **Browser form filling:** risky and unreliable for a demo; Ather opens and
  reads pages instead.
- **App interface in 14 languages:** the interface is English; the AI still
  answers in the user's language.

## 7. Errors and safety

- Ollama not running → Ather starts it (`ollama serve`) or shows a fix-it card.
- Model missing → first-run download screen with progress and retry.
- Destructive AI actions (delete note/task) are undoable; email is read-only.
- MCP server binds to 127.0.0.1 only, off by default.
- Mail passwords are stored with Electron `safeStorage` (Windows DPAPI).

## 8. Testing

- `node:test` unit tests for the store and each tool handler (temp DB).
- Brain test: scripted prompts ("add a task to study DBMS tomorrow") against
  real Ollama, asserting the right tool call and DB row.
- Packaged smoke test: build the installer, install, launch, check the notch
  window appears, run one chat and one voice round trip.

## 9. Changes made while building

- Brain runs as `ather-brain` (Qwen 3.5 4B with a 12K context): Ollama's default 4K context was
  filled by the ~3.2K-token tool list and cut answers off mid-sentence.
- `kokoro-js` only ships English voices, so non-Latin replies (Hindi, Russian, Chinese, …) use the
  Windows built-in voices instead; whichever voices are installed on the PC are used.
- Image generation uses the Vulkan build of stable-diffusion.cpp (30 MB) instead of CUDA (700 MB).

## 10. Deliverables

- Source in `E:\ather 2.0` (Electron + React + Vite, electron-builder).
- `dist\Ather-Setup-<version>.exe` (NSIS installer, like Taby's).
- `README.md` with how to run, build, and the feature list for the report.
