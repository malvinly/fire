import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built dist/ folder works wherever it is copied or served from.
  base: './',
  preview: { port: 4173 },
})
