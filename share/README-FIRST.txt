MAYA - a voice assistant that runs on your own laptop
=====================================================

HOW TO INSTALL (one time, about 20-60 minutes depending on the internet)
1. Right-click the zip > "Extract All...", open the folder, double-click  start.bat
   - If Windows says "Windows protected your PC": click "More info" > "Run anyway".
     (Maya is a student project, so its files have no paid signature.)
   - If Windows asks "Do you want to allow this app to make changes?" (for Node.js or Git): click Yes.
2. Keep the window open. start.bat does everything by itself:
   - checks this laptop (Windows, memory, graphics card, free disk),
   - installs Ollama and the AI brain that fits this laptop (Lite 2B / Standard 4B / Full 4B + 9B + Coder),
   - installs Python 3 (numpy, pandas, matplotlib, openpyxl), Node.js and Git if they are missing,
   - installs Maya, asks the AI a test question, and waits while Maya downloads its ears and voice,
   - writes MEMORY.md: what this laptop has, everything installed, and whether each step worked.
3. When it says Done, say "Hey Maya".

If something fails: run start.bat again (it skips what is already done). If it still fails, send MEMORY.md
(in this folder) to the person who shared Maya with you.

HOW TO USE
- Say "Hey Maya" - no button needed. It greets you and asks what to do.
- Or move the mouse to the top-centre of the screen, or press Ctrl+Space.
- Try: "what can you do?", "open YouTube and play the first video", "remind me at 5 to drink water",
  "make the text bigger", "explain my screen", "build me a calculator website".
- Hands-free mouse (head tracking), on-screen keyboard and switch control are in Accessibility.

PRIVACY
Everything runs on this laptop. Nothing is sent to the internet unless you connect a cloud AI yourself.
Risky actions (sending email, deleting, closing apps, shutting down) always ask first.

NEEDS: Windows 10 or 11 (64-bit), 8 GB RAM or more, 10-30 GB free disk, internet for the first setup,
a microphone allowed in Settings > Privacy > Microphone.
Project: https://github.com/Achu226/ather
