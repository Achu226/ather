import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: r('./dist/renderer'),
    emptyOutDir: true,
    rollupOptions: { input: { notch: r('./src/renderer/notch.html'), app: r('./src/renderer/app.html'), snip: r('./src/renderer/snip.html'), captions: r('./src/renderer/captions.html'), headmouse: r('./src/renderer/headmouse.html'), prompter: r('./src/renderer/prompter.html'), camera: r('./src/renderer/camera.html'), overlay: r('./src/renderer/overlay.html'), keyboard: r('./src/renderer/keyboard.html'), sos: r('./src/renderer/sos.html') } },
  },
});
