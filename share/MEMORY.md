# Maya - everything it needs (installed by start.bat)

start.bat checks this laptop, installs every item below that is missing, tests it, and adds a report at the
end of this file ("Setup on <PC name>"). If something fails, run start.bat again; if it still fails, send this
file to the person who shared Maya with you.

| What | Why Maya needs it | Size |
|---|---|---|
| Ollama | The local AI engine that runs the brain models | ~1 GB |
| AI brain, chosen for this laptop | **Lite** (no 4 GB graphics card or under 10 GB RAM): Qwen 3.5 2B · **Standard** (4-5 GB graphics card): Qwen 3.5 4B · **Full** (6 GB+ graphics card and 14 GB+ RAM): Qwen 3.5 4B + 9B + Qwen 2.5 Coder 7B | 3-15 GB |
| nomic-embed-text | Searching your notes and files by meaning | 0.3 GB |
| Python 3 + numpy, pandas, matplotlib, openpyxl | Charts, Excel files, "run this code" | ~0.5 GB |
| Node.js | Browser add-ons (MCP) | ~0.1 GB |
| Git | The app builder ("build me a website") | ~0.3 GB |
| Maya | The app itself | ~0.5 GB |
| Ears and voice (Whisper, Kokoro, "Hey Maya" listener) | Hearing you and talking back; Maya downloads these itself on first start | ~1 GB |
| Image models (only with a 4 GB+ graphics card) | Making pictures | 2-6 GB |

Needs: Windows 10 or 11 (64-bit), 8 GB RAM or more, internet for the first setup, a microphone allowed in
Windows Settings > Privacy > Microphone.

# Setup reports
