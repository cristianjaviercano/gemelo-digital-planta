import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './', // Rutas relativas para despliegue universal (GitHub Pages, Vercel, Portafolio Web)
  plugins: [tailwindcss()],
  server: { port: 5173, strictPort: true },
  build: {
    chunkSizeWarningLimit: 800, // Three.js ocupa ≈ 500 kB
    outDir: 'dist',
  },
});
