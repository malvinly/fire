# Development

Everything needed to change, test or maintain the FIRE Planner. For using it, see the
[README](../README.md).

## Setup

Requires Node 22+ (developed on Node 24).

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:5173 and reloads as you edit.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload (port 5173) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the built `dist/` folder (port 4173; same address as the `dist/` launcher) |
| `npm test` | All tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm run data:build` | Rebuild market data (add `-- --refresh` to re-download the spreadsheets) |

Before committing: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Project layout

```
src/
  engine/        UI-free calculation engine (pure TypeScript, unit-tested)
    simulate.ts    one market path, year by year
    solve.ts       success rates, earliest dates, FIRE numbers, detail view
    context.ts     per-scenario precomputation (Social Security, healthcare, dated items…)
    tax.ts         federal/state tax, Social Security taxation, bracket-fill room
    socialSecurity.ts  PIA from earnings, claiming adjustments, spousal, trust-fund cut
    returns.ts     historical windows and block bootstrap
    assumptions.ts the "How this works" content
    defaults.ts    default assumptions and the example plan
  data/
    market.json    generated annual returns (committed)
    rules.ts       tax brackets, SSA constants, RMD table (update yearly)
  worker/          Web Worker pool that runs the engine off the main thread
  ui/              React components, charts, session files, input help text (helpText.ts)
public/
  Start FIRE Planner.cmd  double-click launcher, copied into dist/ by the build
  serve.ps1               tiny localhost-only static server (Windows PowerShell, no Node) used by the launcher
scripts/
  build-market-data.ts   rebuilds src/data/market.json from Shiller + Damodaran
tests/             Vitest suites (see below)
docs/
  DESIGN.md              research, core design and how each result is defined
  DECISIONS.md           every judgement call (D-numbers), where to change it
  UPDATE_DATA_PROMPT.md  copy-paste prompt for an LLM to refresh the data
  DEVELOPMENT.md         this file
```

Terminology: the UI says "simulated markets" and "real past markets"; the code says bootstrap and
historical paths. `docs/DECISIONS.md` D56 has the full mapping.

## Tests

Layered so each kind of mistake has a test that can catch it:

1. **Deterministic** (`tests/deterministic.test.ts`) — fixed returns; must match hand arithmetic exactly
   (perpetuity, depletion, coast discounting, fixed-dollar items).
2. **Historical vs. FI Calc** (`tests/historical.test.ts`) — $1M / $40k / 30 years / 80-15-5 must match
   FI Calc's 121-of-125 windows within two windows; bootstrap sanity checks.
3. **Social Security vs. SSA** (`tests/socialSecurity.test.ts`) — SSA's published 2026 worked example
   (AIME $5,825 → PIA $2,609.80 → $1,826 at 62).
4. **Taxes** (`tests/tax.test.ts`) — hand-worked 2026 MFJ examples incl. Social Security taxation and NIIT.
5. **Account rules** (`tests/withdrawals.test.ts`, `tests/paths.test.ts`) — 59½ boundary, Roth-ladder
   5-year rule, penalties, RMDs, HSA, two spouses of different ages, Social Security in the simulation,
   healthcare phases, gains/basis, and an after-tax cash-flow identity (withdrawals + income = spending + taxes).
6. **Headline numbers** (`tests/solve.test.ts`) — the FIRE number, earliest date and Coast number pass at
   the value shown and fail just below it; stricter-of-two; percentile bands; worst-years ordering.
7. **Properties** (`tests/properties.test.ts`) — more spending never helps, more savings never delays FIRE.

## Yearly data update

Market data, tax brackets, Social Security constants and the Trustees Report change every year.
Paste [`UPDATE_DATA_PROMPT.md`](UPDATE_DATA_PROMPT.md) into a new LLM coding session in this folder;
it refreshes the data, re-checks the reference tests by hand, and verifies the build. Afterwards,
rebuild your permanent copy (see the README).

## Privacy

Session files hold your financial details. `.gitignore` blocks them (files named `YYYY-MM-DD *.json`,
`sessions/`, `fire-sessions/`), SSA statements (`*.xml`, `*.pdf`), spreadsheets/CSVs, `.env` files and
local Claude settings. Keep your sessions folder outside the repository anyway.
