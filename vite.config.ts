import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// The app's version is the date of the commit being built, as YYYY.MM.DD (D90): there is no API or file
// format contract to number, and every push to main publishes, so the date says all a version needs to.
// Falls back to today's date when git isn't available (a build from a downloaded copy of the source).
function versionDate(): string {
  try {
    const d = execSync('git log -1 --format=%cd --date=format:%Y.%m.%d', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(d)) return d
  } catch {
    // no git
  }
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n, i) => (i ? String(n).padStart(2, '0') : String(n))).join('.')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Shown in the footer and on the About block so a bug report can say which version it came from.
  define: { __APP_VERSION__: JSON.stringify(versionDate()) },
  // Relative asset paths so the built dist/ folder works wherever it is copied or served from.
  base: './',
  // Uncommon fixed ports: the browser keeps the unsaved draft and the sessions-folder permission per
  // localhost:port, so sharing Vite's default ports with other local projects would let their pages read it.
  // strictPort: fail rather than silently move to another port (a different origin with an empty draft).
  server: { port: 5391, strictPort: true },
  preview: { port: 4393, strictPort: true },
  // The app is one page loaded once (locally or from the site), so Vite's 500 kB default (meant for pages
  // that must load fast on every visit) is too tight: React and Chart.js alone are about 380 kB. 750 kB leaves room for the planned features and
  // still warns if a heavy library such as xlsx (the data script's, ~400 kB) is pulled into the app by mistake.
  build: { chunkSizeWarningLimit: 750 },
})
