import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    minify: false,      // Prevents the "watering down" of your code
    cssMinify: false,   // Keeps your CSS exactly as it looks in preview
    treeshake: false,   // Forces Vite to keep the games and secret keywords
    assetsDir: 'assets', // Keeps your folder structure organized
  },
  base: './',           // Fixes broken links to your local MP3 server
});