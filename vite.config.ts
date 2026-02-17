import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 1. Remove the username. Just the repo name with slashes.
  base: '/Music-plus/', 

  plugins: [react()],
  
  build: {
    cssCodeSplit: false,
    minify: false,
    rollupOptions: {
      // 2. treeshake should be an object or boolean
      treeshake: false,
      
      // 3. output MUST be an object { }, not the number 1
      output: {
        inlineDynamicImports: true,
      }
    }
  }
});
