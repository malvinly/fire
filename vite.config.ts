import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built dist/ folder works wherever it is copied or served from.
  base: './',
  // Uncommon fixed ports: the browser keeps the unsaved draft and the sessions-folder permission per
  // localhost:port, so sharing Vite's default ports with other local projects would let their pages read it.
  // strictPort: fail rather than silently move to another port (a different origin with an empty draft).
  server: { port: 5391, strictPort: true },
  preview: { port: 4391, strictPort: true },
})
