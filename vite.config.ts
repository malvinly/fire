import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Shown in the footer and on the About block so a saved plan or a bug report can say which version it came from.
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Relative asset paths so the built dist/ folder works wherever it is copied or served from.
  base: './',
  // Uncommon fixed ports: the browser keeps the unsaved draft and the sessions-folder permission per
  // localhost:port, so sharing Vite's default ports with other local projects would let their pages read it.
  // strictPort: fail rather than silently move to another port (a different origin with an empty draft).
  server: { port: 5391, strictPort: true },
  preview: { port: 4391, strictPort: true },
  // The app is always loaded from this computer, so Vite's 500 kB default (meant for downloads over the web)
  // is too tight: React and Chart.js alone are about 380 kB. 750 kB leaves room for the planned features and
  // still warns if a heavy library such as xlsx (the data script's, ~400 kB) is pulled into the app by mistake.
  build: { chunkSizeWarningLimit: 750 },
})
