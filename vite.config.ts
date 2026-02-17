// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/Music-plus/', // Add this line!
  plugins: [react()],
  build: {
    // 1. TOP LEVEL of build (Correct spot)
    cssCodeSplit: false, 
    minify: false,
    
    rollupOptions: {
      // 2. treeshake goes HERE
      treeshake: false, 
      output: {
        inlineDynamicImports: true,
      }
    }
  }
})