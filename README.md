# FIRE Planner

A personal, local-only FIRE (Financial Independence, Retire Early) calculator for a two-person household.
It answers three questions, each at a confidence level you choose (default **90%**, Fidelity's
"significantly below average market" standard):

| FIRE type | Question it answers |
|---|---|
| **Traditional FIRE** | What's the earliest year we can both stop working, and how much do we need then? |
| **Chubby FIRE** | Same, at a higher spending level you enter. |
| **Coast FIRE** | Can we stop saving now and keep working (paycheck covers spending) until 65? What's the earliest year we could stop saving? |

Every answer must pass **two** tests: 10,000 **simulated markets** built from real US market history
(1871–2025), and **every real stretch of history** replayed in order. The lower result counts.

It simulates each year: contributions while working; then spending, healthcare before and after
Medicare, Social Security (computed from your earnings record, cut when the trust fund runs short),
Roth conversions, 59½ access rules, required withdrawals, and federal + state taxes.

Everything runs in your browser; your numbers never leave your computer.

## Start it

Requires [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 in **Chrome or Edge** (needed to save sessions into a folder; other browsers
download and upload session files instead).

## Build a permanent copy

The steps above run a development server from the source code. For a copy you can keep using without it:

```bash
npm run build
```

This creates a self-contained `dist/` folder. To use it, **double-click `Start FIRE Planner.cmd`** inside
`dist/`. It opens the planner in your browser at http://localhost:4173; keep the small window it opens
while you use the planner, and close it when you're done. It needs nothing else installed: no Node.js,
no terminal, no internet.

You can copy the whole `dist/` folder anywhere (e.g. `Documents\FIRE Planner`) and start it from there
the same way. Tip: right-click `Start FIRE Planner.cmd` → *Send to* → *Desktop (create shortcut)*.

Notes:
- Opening `dist/index.html` directly does **not** work: browsers only run the app's background
  calculator from a web address, which is what the launcher provides.
- `dist/` is not in git. Rebuild (and re-copy) after pulling changes or after the yearly data update.
- The built copy (port 4173) and the development server (port 5173) count as different websites to the
  browser: each asks you to choose your sessions folder once and keeps its own unsaved draft. Your session
  files themselves are shared.
- From a terminal, `npm run preview` serves the same `dist/` folder at the same address.

## Using it

- **Enter your numbers** on the left. The left side starts with example numbers; hover the **?** next to
  any label to see what it means and where to find it. Press **Calculate** (about 5–10 seconds).
- **Sessions** — `Sessions…` → choose a folder once, ideally **outside this project folder** (e.g.
  `Documents\fire-sessions`); session files contain your financial details. *Save* updates the current
  session; *Save as new* makes a copy. Next year: open last year's session, *Save as new*
  ("2027 checkup"), click the banner's **Start plan in 2027**, update balances, salaries and
  contributions, **Calculate**. Each file holds your inputs, every assumption used, the data versions,
  and a results summary. Old results are never silently recomputed — a banner tells you if the app's
  data is newer than a session's results.
- **Try a different retirement year** — below the cards, change the year to see your chance of success,
  your savings over time in typical and bad markets, what's in each account, the worst years to have
  started, and a year-by-year table of withdrawals and taxes.
- **How this works** — generated from the plan on screen: every assumption, whether it's a default or
  yours, why, and the source.

## Keeping the numbers current

Market history, tax brackets and Social Security rules change every year. See
[Yearly data update](docs/DEVELOPMENT.md#yearly-data-update).

## More

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — project layout, scripts, tests, data updates
- [docs/DESIGN.md](docs/DESIGN.md) — what the calculator does and how each result is defined
- [docs/DECISIONS.md](docs/DECISIONS.md) — every assumption and judgement call, and where to change it

## Limitations (v1)

Both spouses assumed alive through the plan (no survivor modeling); no ACA subsidies or IRMAA; US market
data only; flat state tax; no 72(t)/Rule of 55; no flexible-spending (guardrail) rules; no session
comparison view. See `docs/DESIGN.md` → "Deferred to v2".

This is a personal planning tool, not financial advice.
