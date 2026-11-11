# Use your PC's AI from your laptop (brain server)

Your strong PC does the thinking. The laptop runs Maya itself: head mouse, voice, screen reading and the on-screen keyboard all work on the laptop. It sends only the questions to the PC. With Tailscale this works from anywhere: college, home or a friend's house.

## On the PC (once)
1. Install **Tailscale** from https://tailscale.com/download and sign in. Google sign-in is fine.
2. In Maya, open **AI models** and go to **Brain server**.
3. Press **Let my other devices use this brain**. If Windows asks whether Ollama may use the network, press **Allow**.
4. Copy the address marked **Tailscale: anywhere**. It looks like `100.101.102.103:11434`.
5. Keep the PC switched on. In Windows Settings → System → Power, set "Sleep" to **Never** while you use it from the laptop.

## On the laptop
1. Install Maya: download `Maya-Setup-x.y.z.exe` from https://github.com/Achu226/ather/releases/latest
2. Install **Tailscale** and sign in with the **same account** as on the PC.
3. In Maya, open **AI models** and go to **Brain server**. Paste the PC's address, press **Test**, then **Use it**.
4. Ask Maya something. The PC does the thinking.

If the PC can't be reached, for example because it is off or Tailscale is disconnected, Maya tells you and uses the laptop's own AI if it has one. To go back for good, press **Back to this PC** on the laptop.

## Safety
- The AI on the PC has **no password**. Share it only over Tailscale, which only your own signed-in devices can reach.
- **Never** forward port 11434 on your router.
- To stop sharing, press **Stop sharing** on the PC.
- Approvals still happen on the laptop where Maya runs: sending, buying, deleting, and using the mouse.
