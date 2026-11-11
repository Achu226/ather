# Maya 1.9.0 — source code guide

Every source file, in reading order, grouped by the modules of the AETHER project report. 219 files, 21,119 lines. Languages: JavaScript (Node.js + React), HTML, CSS; C# and PowerShell inside src/main/services/pc.js; Windows batch files.

Start here: `start.bat` runs Maya from this folder; `install.bat` installs the latest release on another PC.

## 1. Voice & Interface

Speech to text (Whisper), text to speech (Kokoro, Tamil MMS), the face window (notch), the app window, hands-free control (voice commands, head mouse, keyboard, switch scanning, SOS) and their bridge to the core.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/main.js](../src/main/main.js) | 457 | Electron entry point: creates every service, the windows, global shortcuts and timers. |
| 2 | [src/main/windows.js](../src/main/windows.js) | 281 | All windows: the face at the top of the screen, the app, tray, snip overlay, captions bar, head-mouse camera and voice-control layer. |
| 3 | [src/preload/preload.cjs](../src/preload/preload.cjs) | 194 | The safe bridge (window.ather) between the web pages and the core. |
| 4 | [src/main/ipc.js](../src/main/ipc.js) | 485 | Every request from the windows to the core (ask, tools, settings, models, workflows, captions, head mouse…), with the PIN-lock check. |
| 5 | [src/main/speech.js](../src/main/speech.js) | 50 | Speaking replies: Kokoro for Latin-script text, Windows voices for other alphabets. |
| 6 | [src/main/dictation.js](../src/main/dictation.js) | 35 | "Type with your voice": transcribed text is pasted into whatever app has focus. |
| 7 | [src/main/services/sapi.js](../src/main/services/sapi.js) | 48 | Offline Windows voices (System.Speech) for languages Kokoro cannot speak, e.g. Hindi, Russian, Chinese. |
| 8 | [src/renderer/notch.html](../src/renderer/notch.html) | 13 | Page for the face window. |
| 9 | [src/renderer/notch.jsx](../src/renderer/notch.jsx) | 663 | The face window: ask by text or voice, hands-free voice chat, emotions, approvals, clipboard picker. |
| 10 | [src/renderer/notch.css](../src/renderer/notch.css) | 67 | Styles of the face window at the top of the screen. |
| 11 | [src/renderer/shared/voice.js](../src/renderer/shared/voice.js) | 97 | Hands-free voice: wait for the user to speak, notice when they stop, and detect them talking over Maya. |
| 12 | [src/renderer/shared/audio.js](../src/renderer/shared/audio.js) | 95 | Microphone capture at 16 kHz (what Whisper expects) and speech playback with a mouth-level callback. |
| 13 | [src/renderer/shared/Face.jsx](../src/renderer/shared/Face.jsx) | 216 | Maya's animated face: moods, blinking, glances, accessories. |
| 14 | [src/renderer/shared/emotion.js](../src/renderer/shared/emotion.js) | 29 | How the user seems to feel, from their words, so Maya's face can react before it answers. |
| 15 | [src/renderer/shared/useAsk.js](../src/renderer/shared/useAsk.js) | 39 | Sends a question to the brain and follows the streamed answer. |
| 16 | [src/renderer/shared/Markdown.jsx](../src/renderer/shared/Markdown.jsx) | 37 | Shows AI answers as safe Markdown (code, tables, maths). |
| 17 | [src/renderer/shared/ToolResult.jsx](../src/renderer/shared/ToolResult.jsx) | 158 | One line per action Maya took ("Added task…", "Opened Chrome…"). |
| 18 | [src/main/services/holdkeys.js](../src/main/services/holdkeys.js) | 79 | Push-to-talk like a walkie-talkie: hold Right Ctrl to give Maya a command, hold Right Alt to dictate; let go to finish. |
| 19 | [src/main/services/dictate.js](../src/main/services/dictate.js) | 56 | Dictation clean-up, like a careful typist: drop "um"s, follow spoken corrections ("ten, actually fifteen"), |
| 20 | [src/renderer/shared/voicecommands.js](../src/renderer/shared/voicecommands.js) | 98 | Voice-only control: turns spoken commands (show numbers, click 5, scroll down, type …, yes/no, some Tamil) into actions. |
| 21 | [src/main/services/voicecontrol.js](../src/main/services/voicecontrol.js) | 204 | Carries out voice commands in the app the user is working in: numbers or grid on screen, click, scroll, keys, typing. |
| 22 | [src/renderer/overlay.html](../src/renderer/overlay.html) | 37 | Page for the hands-free layer (numbers, grid, scanning highlight, dwell ring). |
| 23 | [src/renderer/overlay.jsx](../src/renderer/overlay.jsx) | 68 | Click-through layer over the whole screen for hands-free control: yellow numbers on every control, a lettered grid, |
| 24 | [src/renderer/app/Accessibility.jsx](../src/renderer/app/Accessibility.jsx) | 254 | Accessibility page: voice only, head mouse and dwell click, keyboard, switch scanning, emergency help, large mode. |
| 25 | [src/renderer/app/Speak.jsx](../src/renderer/app/Speak.jsx) | 92 | Speak for me: a phrase board for people who cannot speak clearly. Click, dwell or scan to a phrase, or choose by |
| 26 | [src/renderer/shared/speakboard.js](../src/renderer/shared/speakboard.js) | 28 | "Speak for me" board logic (as in look-to-speak): the phrases are split into a left and a right half; each glance |
| 27 | [src/renderer/shared/noiseswitch.js](../src/renderer/shared/noiseswitch.js) | 49 | Mouth-noise switch (as in Talon's "pop"): a short, sharp sound such as a lip pop or tongue click presses the switch, |
| 28 | [src/renderer/shared/voicenotes.js](../src/renderer/shared/voicenotes.js) | 50 | Telegram voice notes, done with Chromium's own audio code (no extra library): decode a phone's Ogg/Opus note to |
| 29 | [src/main/services/scanning.js](../src/main/services/scanning.js) | 32 | Switch scanning, for people who can press only one button (or make one sound): controls light up in turn and a |
| 30 | [src/main/services/keyboard.js](../src/main/services/keyboard.js) | 37 | Word suggestions for the on-screen keyboard: common English words plus the words this user types (English or Tamil). |
| 31 | [src/renderer/keyboard.html](../src/renderer/keyboard.html) | 31 | Page for the on-screen keyboard. |
| 32 | [src/renderer/keyboard.jsx](../src/renderer/keyboard.jsx) | 81 | On-screen keyboard for people who type with a head mouse, dwell clicks or a switch. Keys go to the app with the focus |
| 33 | [src/main/services/sos.js](../src/main/services/sos.js) | 156 | Emergency SOS for people who may not be able to reach a phone: a short countdown (so a misheard word can be undone), |
| 34 | [src/main/services/telegram.js](../src/main/services/telegram.js) | 162 | Talk to Maya from your phone through your own Telegram bot (free). Off until the user pastes a bot token from |
| 35 | [src/renderer/sos.html](../src/renderer/sos.html) | 31 | Page for the full-screen SOS sign. |
| 36 | [src/renderer/sos.jsx](../src/renderer/sos.jsx) | 64 | Full-screen emergency sign: a countdown first (so a misheard "help" can be undone), then a flashing |
| 37 | [src/main/services/session.js](../src/main/services/session.js) | 79 | Work timer: "work for 2 hours, then shut down". When time is up Maya sums up the day, says goodbye, |
| 38 | [src/main/services/chatbots.js](../src/main/services/chatbots.js) | 55 | "Ask ChatGPT / ask Claude …" for people who cannot type: open the prompt in the user's own browser (where they |
| 39 | [src/renderer/shared/MicButton.jsx](../src/renderer/shared/MicButton.jsx) | 15 |  |
| 40 | [src/renderer/app.html](../src/renderer/app.html) | 13 | Page for the app window. |
| 41 | [src/renderer/app.jsx](../src/renderer/app.jsx) | 110 | The app window: sidebar sections, setup, lock screen and approvals. |
| 42 | [src/renderer/app.css](../src/renderer/app.css) | 314 | Styles of the app window (chat, workflows, timetable, meters…). |
| 43 | [src/renderer/shared/base.css](../src/renderer/shared/base.css) | 204 | Shared colours, light/dark theme and face animations. |
| 44 | [src/renderer/app/Chat.jsx](../src/renderer/app/Chat.jsx) | 239 | ChatGPT-style chat: conversations, model picker, files, voice, agent checklist. |
| 45 | [src/renderer/app/Home.jsx](../src/renderer/app/Home.jsx) | 173 | Home: briefing, today, coming up (classes, exams), what Maya noticed. |

## 2. Supervisor Orchestration Core

Understands the request, picks the model, chooses tools, plans multi-step goals (Agent and Builder modes) and runs workflows.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/brain.js](../src/main/brain.js) | 468 | The brain: answers a question, calls tools in a loop, plans Agent and Builder goals, streams the reply. |
| 2 | [src/main/models.js](../src/main/models.js) | 89 | Which LLM answers which question. |
| 3 | [src/main/personality.js](../src/main/personality.js) | 99 | Personalities from the website (Normal, Brother, Anime Girl, Butler, Italian, Russian), written for Maya. |
| 4 | [src/main/providers.js](../src/main/providers.js) | 112 | Every place a model can run: local (Ollama, LM Studio) or cloud (any OpenAI-compatible API). |
| 5 | [src/main/ollama.js](../src/main/ollama.js) | 92 | Talks to Ollama: is it running, pull models, build ather-brain/ather-smart, embeddings, free the GPU. |
| 6 | [src/main/tools/index.js](../src/main/tools/index.js) | 15 | The full list of tools the AI can use. |
| 7 | [src/main/tools/select.js](../src/main/tools/select.js) | 76 | Give the model only the tools a request can need: ~60 tool descriptions confuse small models into |
| 8 | [src/main/services/skills.js](../src/main/services/skills.js) | 105 | Skills: named recipes Maya follows ("when I say goodnight, turn on dark mode and read tomorrow's tasks"). |
| 9 | [src/main/services/learning.js](../src/main/services/learning.js) | 79 | Learning from the user, all on this PC: words Maya keeps mishearing, and what the user liked or did not like. |
| 10 | [src/main/services/worklog.js](../src/main/services/worklog.js) | 55 | The work monitor: every action Maya takes, in plain words ("Wrote app.js", "Sent an email to Rahul"), |
| 11 | [src/main/tools/maya.js](../src/main/tools/maya.js) | 131 | Teaching Maya: skills it can learn, what it is doing (the work monitor), and changing how it looks and behaves. |
| 12 | [src/renderer/app/Skills.jsx](../src/renderer/app/Skills.jsx) | 56 |  |
| 13 | [src/renderer/app/Monitor.jsx](../src/renderer/app/Monitor.jsx) | 56 |  |
| 14 | [src/renderer/app/Agent.jsx](../src/renderer/app/Agent.jsx) | 152 |  |
| 15 | [src/renderer/app/Connections.jsx](../src/renderer/app/Connections.jsx) | 154 |  |
| 16 | [src/renderer/app/Brain.jsx](../src/renderer/app/Brain.jsx) | 113 |  |
| 17 | [src/renderer/shared/work.js](../src/renderer/shared/work.js) | 9 | The face Maya makes while a tool runs, like a person at work (exported for tests). |
| 18 | [src/main/services/workflows.js](../src/main/services/workflows.js) | 115 | Runs saved routines as workflows: each step has a live state (waiting, running, awaiting approval, |
| 19 | [src/renderer/app/Workflows.jsx](../src/renderer/app/Workflows.jsx) | 157 | Workflows page: describe → steps → run, live node states, pause/resume/cancel/retry, history. |
| 20 | [src/renderer/app/Models.jsx](../src/renderer/app/Models.jsx) | 126 | AI models page: local and cloud providers, API keys, tests, usage. |

## 3. Local OS & Environment Sandbox

Safe access to the PC: approved folders only, approval cards for risky actions, app opening, computer control, head mouse.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/approvals.js](../src/main/approvals.js) | 34 | Ask the user in a window before a risky tool runs. Unanswered requests are denied after 5 minutes. |
| 2 | [src/main/tools/dev.js](../src/main/tools/dev.js) | 309 | Built-in "MCP-style" capabilities: file manager, Git, SQLite, time, and approved commands. |
| 3 | [src/main/tools/pc.js](../src/main/tools/pc.js) | 180 | PC control, routines and activity. ctx.services supplies pc and activity. |
| 4 | [src/main/services/pc.js](../src/main/services/pc.js) | 499 | PC control and activity sensing through one long-running PowerShell helper (Win32 + Core Audio via C#). |
| 5 | [src/main/tools/computer.js](../src/main/tools/computer.js) | 222 | Computer control: Maya works in other apps through Windows UI Automation (named buttons and fields), |
| 6 | [src/main/services/sysmon.js](../src/main/services/sysmon.js) | 52 | "This PC" monitor: CPU, memory, disk, GPU (NVIDIA), battery and the busiest apps. |
| 7 | [src/main/services/activity.js](../src/main/services/activity.js) | 73 | Which apps/sites the user spends time in (local only, app/site names, never full window titles), |
| 8 | [src/renderer/shared/Approvals.jsx](../src/renderer/shared/Approvals.jsx) | 98 | Approval cards: Maya asks before risky actions. |
| 9 | [src/renderer/app/Activity.jsx](../src/renderer/app/Activity.jsx) | 141 | Activity page: time per app, This PC meters, Maya's actions on the PC. |
| 10 | [src/renderer/headmouse.html](../src/renderer/headmouse.html) | 25 | Page for the head-mouse camera window. |
| 11 | [src/renderer/headmouse.jsx](../src/renderer/headmouse.jsx) | 114 | Hands-free mouse: the webcam follows your head to move the cursor; open your mouth to click, smile to right-click, |
| 12 | [src/renderer/shared/headpose.js](../src/renderer/shared/headpose.js) | 175 | Head mouse maths: face landmarks → cursor position, face expressions → clicks. Pure, so it is unit tested. |

## 4. Autonomous Engineering Sub-Agent

Writes and fixes code: file tools, the command runner and the Python code interpreter.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/services/python.js](../src/main/services/python.js) | 83 | Code interpreter: runs AI-written Python (after the user approves) in a per-conversation work folder. |
| 2 | [src/main/services/files.js](../src/main/services/files.js) | 102 | Makes real Office/PDF files from AI output: PowerPoint (.pptx), Word (.docx) and PDF. |
| 3 | [src/main/tools/power.js](../src/main/tools/power.js) | 58 | Agent mode, code interpreter and file maker tools. ctx.services supplies python and files. |

## 5. Quality Assurance (QA) Sub-Agent

Checks the Engineer's work: loads websites in a hidden browser and reports errors; runs tests.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/services/qa.js](../src/main/services/qa.js) | 45 | QA for websites the Builder makes: loads the page in a hidden window and reports what a tester would see. |
| 2 | [scripts/e2e.mjs](../scripts/e2e.mjs) | 312 | End-to-end check of the real app with Playwright: launches Electron, talks to Maya, saves screenshots. |
| 3 | [scripts/voice-e2e.mjs](../scripts/voice-e2e.mjs) | 85 | Voice-only control, end to end, with no keyboard or mouse: spoken commands (Kokoro's voice → Whisper → command parser) |
| 4 | [scripts/a11y-e2e.mjs](../scripts/a11y-e2e.mjs) | 143 | Accessibility features end to end, acting only in its own test window: the Accessibility page and large mode, |
| 5 | [scripts/work-e2e.mjs](../scripts/work-e2e.mjs) | 77 | 1.6 features end to end, with the real app but a throwaway data folder. The PC is never shut down |
| 6 | [scripts/maya-e2e.mjs](../scripts/maya-e2e.mjs) | 121 | Maya 1.7 by voice, end to end: every request is spoken with Maya's own voice, heard by Whisper, then answered |
| 7 | [scripts/nlp-eval.mjs](../scripts/nlp-eval.mjs) | 84 | Conversation-quality check: runs scripted chats through Maya and has the 9B model grade each answer. |

## 6. GitHub & CI/CD Deployment Sub-Agent

Git and GitHub: commits, publishing to GitHub Pages (asks first), MCP servers, releases and auto-update.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/services/mcp-client.js](../src/main/services/mcp-client.js) | 127 | MCP client: connects Maya to other MCP servers (stdio or HTTP) and turns their tools into Maya tools. |
| 2 | [src/main/services/mcp-presets.js](../src/main/services/mcp-presets.js) | 72 | Ready-made MCP servers. npx-based ones need Node.js on the PC (start.bat / install.bat install it). |
| 3 | [src/main/services/mcp.js](../src/main/services/mcp.js) | 51 | "Connect Claude, Codex, your own agent": a local MCP server exposing Maya's tools. Localhost only. |
| 4 | [src/renderer/app/Mcp.jsx](../src/renderer/app/Mcp.jsx) | 126 | Connected tools (MCP servers): status, permissions, logs, add your own. |
| 5 | [src/main/updater.js](../src/main/updater.js) | 31 | Updates from GitHub releases (electron-updater). Quietly does nothing until a release feed is configured. |
| 6 | [scripts/release.mjs](../scripts/release.mjs) | 20 | Publish the built installer as a GitHub release; installed copies of Maya then update themselves. |
| 7 | [scripts/check-update.mjs](../scripts/check-update.mjs) | 23 | Starts the installed Maya and asks it to check GitHub for updates: node scripts/check-update.mjs |

## 7. AI models on this PC

Local machine-learning worker: Whisper, Kokoro, CLIP, OCR, faces, background removal, upscaling, image generation.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/ml/catalog.js](../src/main/ml/catalog.js) | 84 | Every model Maya needs, where it comes from, and whether it is on disk. |
| 2 | [src/main/ml/client.js](../src/main/ml/client.js) | 41 | Main-process side of the ML utility process. Restarts it if it crashes. |
| 3 | [src/main/ml/worker.js](../src/main/ml/worker.js) | 18 | ML utility process: runs core.js functions on request from the main process. |
| 4 | [src/main/ml/core.js](../src/main/ml/core.js) | 223 | Local ML models, loaded lazily. Runs inside the ML utility process (worker.js) so the UI never freezes. |
| 5 | [src/main/services/imaging.js](../src/main/services/imaging.js) | 100 | Image editor (blur emails, faces, names) and local image generation (stable-diffusion.cpp + SD-Turbo). |
| 6 | [src/main/services/syscheck.js](../src/main/services/syscheck.js) | 41 | "Can my computer run it?": memory, graphics card, disk space and a plain verdict. |
| 7 | [src/renderer/app/ModelList.jsx](../src/renderer/app/ModelList.jsx) | 64 | Download list for Maya's own AI models. |
| 8 | [src/renderer/app/Setup.jsx](../src/renderer/app/Setup.jsx) | 51 | First-run setup: checks the PC and downloads the models. |
| 9 | [src/renderer/app/Images.jsx](../src/renderer/app/Images.jsx) | 142 | Image tools: create, blur private details, remove background, upscale. |
| 10 | [scripts/fetch-models.js](../scripts/fetch-models.js) | 22 | Download every model ahead of time: node scripts/fetch-models.js |
| 11 | [scripts/make-share.mjs](../scripts/make-share.mjs) | 24 | Builds release/Maya-<version>-share.zip: start.bat + setup script + README + the Maya installer, for sharing with friends. |
| 12 | [scripts/wake-e2e.mjs](../scripts/wake-e2e.mjs) | 44 | "Hey Maya" through the real microphone path: the app hears a recording (8 s of quiet room, then "Hey Maya" in |

## 8. Productivity

Tasks, notes, reminders, habits, focus, calendar, mail, briefing, scheduler.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/tools/productivity.js](../src/main/tools/productivity.js) | 272 | Tasks, notes, reminders, habits, focus, calendar, patterns and undo tools. |
| 2 | [src/main/services/scheduler.js](../src/main/services/scheduler.js) | 58 | Fires reminders and finishes focus timers. notify(title, body, kind) shows the alert. |
| 3 | [src/main/services/calendar-feeds.js](../src/main/services/calendar-feeds.js) | 42 | Read-only Google / Outlook / Apple calendars through their private iCal (.ics) links. |
| 4 | [src/main/services/mail.js](../src/main/services/mail.js) | 139 | "Your inbox, sorted": read, search, reply to and tidy emails over IMAP/SMTP, and let the brain pick what needs the user. |
| 5 | [src/main/services/work.js](../src/main/services/work.js) | 81 | Managing the user's work: email follow-ups ("remind me if Rahul doesn't reply by Friday") and the Friday weekly report. |
| 6 | [src/main/services/briefing.js](../src/main/services/briefing.js) | 110 | Morning briefing, evening review and gentle nudges. |
| 7 | [src/renderer/app/useData.js](../src/renderer/app/useData.js) | 23 | Small helpers the app pages share (load data, call a tool, format dates). |
| 8 | [src/renderer/app/Tasks.jsx](../src/renderer/app/Tasks.jsx) | 54 | Tasks page. |
| 9 | [src/renderer/app/Notes.jsx](../src/renderer/app/Notes.jsx) | 59 | Notes page. |
| 10 | [src/renderer/app/Habits.jsx](../src/renderer/app/Habits.jsx) | 51 | Habits page with streaks. |
| 11 | [src/renderer/app/Focus.jsx](../src/renderer/app/Focus.jsx) | 51 | Focus timer page. |
| 12 | [src/renderer/app/Calendar.jsx](../src/renderer/app/Calendar.jsx) | 54 | Calendar page. |
| 13 | [src/renderer/app/Inbox.jsx](../src/renderer/app/Inbox.jsx) | 81 | Inbox page: mail sorted by importance. |

## 9. Study

PDF chat, quizzes and flashcards, lecture recorder, timetable and exam countdown.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/services/docs.js](../src/main/services/docs.js) | 82 | "Chat with your PDFs": extract text, split into chunks, embed, and pull the relevant parts into each answer. |
| 2 | [src/main/services/study.js](../src/main/services/study.js) | 58 | Study tools: quizzes, flashcards and summaries from a topic, a note or a file. |
| 3 | [src/main/services/lectures.js](../src/main/services/lectures.js) | 56 | Lecture recorder: live transcript in 30-second pieces, then study notes written by the smart model. |
| 4 | [src/main/tools/student.js](../src/main/tools/student.js) | 106 | Timetable, exam countdown, clipboard history, health breaks and live captions. |
| 5 | [src/renderer/app/Study.jsx](../src/renderer/app/Study.jsx) | 209 | Study page: quizzes, flashcards, summaries, lectures, timetable tabs. |
| 6 | [src/renderer/app/Lectures.jsx](../src/renderer/app/Lectures.jsx) | 137 | Lecture recorder with live transcript and notes. |
| 7 | [src/renderer/app/Timetable.jsx](../src/renderer/app/Timetable.jsx) | 102 | Weekly timetable (import from photo/PDF) and exam countdown. |

## 10. Helpers

Memory, web, smart search, screen snip, clipboard history, live captions, health breaks, extras.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/tools/assistant.js](../src/main/tools/assistant.js) | 78 | Memory brain (save, update, forget, no secrets), screen reading and study-set tools. |
| 2 | [src/main/tools/extras.js](../src/main/tools/extras.js) | 177 | Image, personality, animation and agent-step tools. |
| 3 | [src/main/services/web.js](../src/main/services/web.js) | 33 | Web search (DuckDuckGo) and reading a web page as text. |
| 4 | [src/main/services/search.js](../src/main/services/search.js) | 89 | Smart search: "find my photo of the beach", "the note about DBMS", "my resume file". |
| 5 | [src/main/services/clipboard.js](../src/main/services/clipboard.js) | 34 | Recent copied text, kept in memory only (never written to disk). Passwords and anything a password |
| 6 | [src/main/services/health.js](../src/main/services/health.js) | 28 | Health breaks: water, 20-20-20 eye breaks and stretching, counted only in minutes the user is actually |
| 7 | [src/renderer/app/Search.jsx](../src/renderer/app/Search.jsx) | 82 | Smart search of your files and photos. |
| 8 | [src/renderer/snip.html](../src/renderer/snip.html) | 13 | Page for the screen-snip overlay. |
| 9 | [src/renderer/snip.jsx](../src/renderer/snip.jsx) | 40 | Drag a box on a frozen screenshot to ask about that part (Ctrl+Shift+S). |
| 10 | [src/renderer/captions.html](../src/renderer/captions.html) | 25 | Page for the live captions bar. |
| 11 | [src/renderer/captions.jsx](../src/renderer/captions.jsx) | 52 | Live captions of the computer's sound (videos, online classes, calls), optionally translated to English. |
| 12 | [src/main/tools/everyday.js](../src/main/tools/everyday.js) | 210 | Everyday voice actions (as on heynixi.app): point at things on screen, write at the cursor, teleprompter, |
| 13 | [src/main/services/places.js](../src/main/services/places.js) | 96 | Wheelchair-accessible places nearby, from OpenStreetMap's own search (Nominatim: free, no key; one request per |
| 14 | [src/main/services/watch.js](../src/main/services/watch.js) | 60 | Watch a website (as in OpenClaw's monitoring): Maya re-reads a page every few hours and tells the user (desktop |
| 15 | [src/main/services/browser.js](../src/main/services/browser.js) | 93 | Maya's own browser: one window with its own signed-in session (cookies kept). Maya reads pages and clicks and types |
| 16 | [src/main/tools/browser.js](../src/main/tools/browser.js) | 55 | Maya's own browser (services/browser.js): websites by numbered elements, signed in once by the user. |
| 17 | [src/main/services/brainserver.js](../src/main/services/brainserver.js) | 58 | Brain server: this PC shares its Ollama with the user's other devices (over Tailscale), or Maya thinks on another PC's. |
| 18 | [src/renderer/app/BrainServer.jsx](../src/renderer/app/BrainServer.jsx) | 73 |  |
| 19 | [src/main/services/timers.js](../src/main/services/timers.js) | 41 | Countdown timers ("set a timer for 10 minutes"). notify() rings and speaks when one ends; onChange(list) keeps the |
| 20 | [src/renderer/prompter.html](../src/renderer/prompter.html) | 31 |  |
| 21 | [src/renderer/prompter.jsx](../src/renderer/prompter.jsx) | 79 | Teleprompter that listens: the script scrolls along as you read it aloud, and waits when you pause. |
| 22 | [src/renderer/shared/prompter.js](../src/renderer/shared/prompter.js) | 26 | Teleprompter maths: find where the reader is in the script from the last words they said. |
| 23 | [src/renderer/camera.html](../src/renderer/camera.html) | 12 |  |
| 24 | [src/renderer/camera.js](../src/renderer/camera.js) | 21 | Camera eyes: one photo from the webcam, taken only when Maya is asked ("what's in front of me?", "read this paper"). |
| 25 | [src/main/services/interpreter.js](../src/main/services/interpreter.js) | 38 | Interpreter mode: two people talk, Maya says each sentence in the other language (English ↔ another language). |
| 26 | [src/main/tools/people.js](../src/main/tools/people.js) | 138 | People and feelings: a contact book for calls and WhatsApp by voice, and a spoken diary with moods. |

## 11. Data, security and settings

SQLite storage, encrypted secrets, PIN lock, backup, theme.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [src/main/paths.js](../src/main/paths.js) | 12 | Where Maya keeps its data, models and pictures (%APPDATA%\Maya). |
| 2 | [src/main/store.js](../src/main/store.js) | 133 | SQLite database: tables, migrations, settings and undo history. |
| 3 | [src/main/secrets.js](../src/main/secrets.js) | 16 | Passwords (e.g. the email app password) encrypted with Windows DPAPI through Electron safeStorage. |
| 4 | [src/main/security.js](../src/main/security.js) | 56 | PIN lock: scrypt-hashed PIN, lock on start / Windows lock / idle, and a brute-force pause. |
| 5 | [src/main/backup.js](../src/main/backup.js) | 62 | Backup / restore of the user's data (database + pictures; AI models are not included, they re-download). |
| 6 | [src/main/theme.js](../src/main/theme.js) | 41 | Light / dark theme: Windows title bars, tray + window icons, and (installed app) the Maya shortcuts' icons. |
| 7 | [src/renderer/shared/LockScreen.jsx](../src/renderer/shared/LockScreen.jsx) | 43 | PIN lock screen. |
| 8 | [src/renderer/shared/look.js](../src/renderer/shared/look.js) | 71 | Theme (light/dark) and face style, shared by every component in a window. |
| 9 | [src/renderer/shared/colors.js](../src/renderer/shared/colors.js) | 28 | "Any pill, any eyes" colour maths (no browser needed, so it is unit tested). |
| 10 | [src/renderer/app/Settings.jsx](../src/renderer/app/Settings.jsx) | 335 | Settings: voice, personality, helpers, memories, security, backup, updates. |
| 11 | [src/renderer/app/Appearance.jsx](../src/renderer/app/Appearance.jsx) | 152 | Theme, face colours, eyes, accessories, glow and motion settings. |
| 12 | [scripts/make-icon.js](../scripts/make-icon.js) | 41 | Renders Maya's face to assets/: icon.png/.ico (purple) and icon-dark.png/.ico (black, for dark theme). |
| 13 | [scripts/face-gallery.mjs](../scripts/face-gallery.mjs) | 63 | Renders every face mood from the real app into docs/screenshots/faces/ (for checking and the report). |
| 14 | [scripts/pack-source.mjs](../scripts/pack-source.mjs) | 202 | Writes the source code "in order": docs/CODE_GUIDE.md (every file, grouped by the project report's modules), |
| 15 | [scripts/print-source.mjs](../scripts/print-source.mjs) | 52 | Prints docs/CODE_GUIDE.md + docs/SOURCE-LISTING.md as one PDF for the project guide: docs/Maya-source-code.pdf |

## 12. Tests

Automatic checks (npm test). Model tests skip themselves when a model is not downloaded.

| # | File | Lines | What it does |
|---|---|---|---|
| 1 | [test/activity.test.js](../test/activity.test.js) | 62 | Activity tracking and routines. |
| 2 | [test/advanced.test.js](../test/advanced.test.js) | 140 | Chat summaries, follow-ups, memory and real-model conversation checks. |
| 3 | [test/agent.test.js](../test/agent.test.js) | 171 | My Maya: safe look/name/speed changes by voice, rules in the prompt, OpenAI voice request, wake word follows the name. |
| 4 | [test/brain.test.js](../test/brain.test.js) | 101 | Integration test against the real local Ollama + qwen3.5:4b. Skipped when Ollama is not running. |
| 5 | [test/brainserver.test.js](../test/brainserver.test.js) | 43 |  |
| 6 | [test/briefing.test.js](../test/briefing.test.js) | 48 | Daily briefing and nudges. |
| 7 | [test/browser.test.js](../test/browser.test.js) | 58 |  |
| 8 | [test/coding-agent.test.js](../test/coding-agent.test.js) | 61 | Acceptance test (master prompt, feature 2): the agent fixes a reproducible bug so the project's tests pass. |
| 9 | [test/colors.test.js](../test/colors.test.js) | 28 |  |
| 10 | [test/computer.test.js](../test/computer.test.js) | 79 | Computer control through Windows UI Automation on a real app: Notepad. |
| 11 | [test/dictate.test.js](../test/dictate.test.js) | 30 |  |
| 12 | [test/emotion.test.js](../test/emotion.test.js) | 27 | Face emotions from what the user says. |
| 13 | [test/everyday.test.js](../test/everyday.test.js) | 62 |  |
| 14 | [test/eyes.test.js](../test/eyes.test.js) | 43 |  |
| 15 | [test/headpose.test.js](../test/headpose.test.js) | 108 | Head mouse maths: head direction, cursor, mouth/smile clicks. |
| 16 | [test/holdkeys.test.js](../test/holdkeys.test.js) | 48 |  |
| 17 | [test/image-extras.test.js](../test/image-extras.test.js) | 50 | Background removal and upscaling. |
| 18 | [test/imaging.test.js](../test/imaging.test.js) | 45 | Real image generation + blur (slow, uses the GPU). Skipped until the models are downloaded. |
| 19 | [test/integration.test.js](../test/integration.test.js) | 71 | Integration: smart search, MCP agent connection, calendar feeds. Needs Ollama + downloaded models + internet. |
| 20 | [test/keyboard.test.js](../test/keyboard.test.js) | 29 | Keyboard word suggestions; passwords and codes never learned. |
| 21 | [test/learning.test.js](../test/learning.test.js) | 91 | Learning: misheard words fixed next time, a thumbs-down note becomes a preference, good/bad answer by voice. |
| 22 | [test/lectures.test.js](../test/lectures.test.js) | 43 | Lecture pipeline with real models: Kokoro "teacher" audio → Whisper transcript pieces → notes → flashcards. |
| 23 | [test/lite.test.js](../test/lite.test.js) | 23 |  |
| 24 | [test/mail.test.js](../test/mail.test.js) | 155 | Email: search, read, threaded reply, archive (never delete), approvals, follow-ups, weekly report; live model checks. |
| 25 | [test/mcp-client.test.js](../test/mcp-client.test.js) | 106 | Real MCP servers: each must connect, list tools AND run a tool. Needs internet + Node (npx) the first time. |
| 26 | [test/memory.test.js](../test/memory.test.js) | 44 | Memory: survives restart, updates, deletes, refuses secrets. |
| 27 | [test/ml.test.js](../test/ml.test.js) | 33 | Real-model checks (slow). Skipped until the models are downloaded: node scripts/fetch-models.js |
| 28 | [test/monitor.test.js](../test/monitor.test.js) | 141 | Work monitor in plain words, working faces, OLLAMA_HOST addresses, tool calls written as text. |
| 29 | [test/noiseswitch.test.js](../test/noiseswitch.test.js) | 36 |  |
| 30 | [test/pc.test.js](../test/pc.test.js) | 40 | App-name matching and window descriptions. |
| 31 | [test/people.test.js](../test/people.test.js) | 75 |  |
| 32 | [test/places.test.js](../test/places.test.js) | 108 |  |
| 33 | [test/power.test.js](../test/power.test.js) | 81 | Python, PowerPoint/Word, approvals, code interpreter, agent mode. |
| 34 | [test/productivity.test.js](../test/productivity.test.js) | 78 | Tasks, notes, reminders, habits, focus, undo. |
| 35 | [test/prompter.test.js](../test/prompter.test.js) | 20 |  |
| 36 | [test/providers.test.js](../test/providers.test.js) | 73 | Provider engine against real endpoints: Ollama's OpenAI-compatible API registered as a "custom" provider, |
| 37 | [test/scanning.test.js](../test/scanning.test.js) | 35 | Switch scanning order: groups, controls, back step. |
| 38 | [test/security.test.js](../test/security.test.js) | 81 | PIN lock, backup and restore, icons. |
| 39 | [test/select.test.js](../test/select.test.js) | 45 | Which tools each request gets. |
| 40 | [test/services.test.js](../test/services.test.js) | 83 | Tool names, read-only tools, scheduler, audio. |
| 41 | [test/session.test.js](../test/session.test.js) | 321 | Work timer goodbye and shutdown (never real), voice wait/magnifier/pages, blink click, care reminders, emergency call, ChatGPT answer reading. |
| 42 | [test/skills-learn.test.js](../test/skills-learn.test.js) | 77 |  |
| 43 | [test/skills.test.js](../test/skills.test.js) | 77 | Skills: built-ins use real tools, the right skill is picked, everyday sentences pick none, taught skills by name. |
| 44 | [test/sos.test.js](../test/sos.test.js) | 118 | Emergency: countdown, cancel, caregiver email, check-in hours. |
| 45 | [test/speakboard.test.js](../test/speakboard.test.js) | 28 |  |
| 46 | [test/student.test.js](../test/student.test.js) | 85 | Timetable, exams, class alerts, clipboard, health breaks. |
| 47 | [test/telegram.test.js](../test/telegram.test.js) | 213 |  |
| 48 | [test/voicecommands.test.js](../test/voicecommands.test.js) | 51 | Voice commands, questions left for the AI, spoken yes/no in English and Tamil. |
| 49 | [test/wake.test.js](../test/wake.test.js) | 56 | "Hey Maya" wake word and stop phrases. |
| 50 | [test/watch.test.js](../test/watch.test.js) | 82 |  |
| 51 | [test/web-voice.test.js](../test/web-voice.test.js) | 33 | Web search through the brain + Windows voice fallback. Needs Ollama and internet. |
| 52 | [test/workflows.test.js](../test/workflows.test.js) | 99 | Workflows: 3 real steps, cancel, pause/resume, retry, approval, schedule. |
