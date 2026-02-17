// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    minify: false,           // Disables minification (no more "watered down" code)
    cssMinify: false,        // Keeps your CSS exactly as it is in preview
    sourcemap: true,         // Helps you debug if something still breaks
    treeshake: false,        // FORCES Vite to keep all "unused" game/visualizer logic
    rollupOptions: {
      output: {
        manualChunks: () => 'everything.js', // Forces all JS into ONE single file
      },
    },
  },
})