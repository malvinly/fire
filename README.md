# FIRE Planner

**Use it: https://malvinly.github.io/fire/** (nothing to install; everything runs in your browser).

A FIRE (Financial Independence, Retire Early) calculator for a two-person household. It answers three
questions, each at a confidence level you choose (default **90%**, Fidelity's "significantly below average
market" standard):

| FIRE type | Question it answers |
|---|---|
| **Traditional FIRE** | What's the earliest year we can both stop working, and how much do we need then? |
| **Chubby FIRE** | Same, at a higher spending level (default: 1.2 × today's spending). |
| **Coast FIRE** | Can we stop saving now and keep working (paycheck covers spending) until 65? What's the earliest year we could stop saving? |

Every answer must pass **two** tests: 10,000 **simulated markets** built from real US market history
(1871–2025), and **every real stretch of history** replayed in order. The lower result counts.

It simulates each year: contributions while working; then spending, healthcare before and after
Medicare, Social Security (computed from your earnings record, cut when the trust fund runs short),
Roth conversions, 59½ access rules, required withdrawals, and federal + state taxes.

Everything runs in your browser; your numbers never leave your computer. There are no accounts, cookies or
analytics.

**A personal tool, published as is.** It was built around one household's situation: a US married couple
filing jointly, with 401(k)/IRA, Roth and HSA accounts and Social Security, who want a retirement with room
to enjoy it. It is not meant as a general calculator for everyone; if your situation is different, its
assumptions may not fit. It is not financial advice.

## Why no Lean FIRE, Fat FIRE or Barista FIRE

All three are left out on purpose; they don't match the kind of plan this tool is built for.

- **Lean FIRE** — retiring on a bare-bones budget means watching every dollar for decades. This
  planner is for a retirement with room to enjoy it: plenty of vacations, travel and eating out,
  without penny-pinching.
- **Fat FIRE** — funding a luxury retirement usually means saving very aggressively for years, putting
  off travel, purchases and experiences until after work ends. This planner assumes the opposite
  tradeoff: enjoy money along the way and retire comfortably. Traditional and Chubby cover that range.
- **Barista FIRE** — relies on part-time work in retirement to cover part of spending. Here, retirement
  means not needing a paycheck: every plan must stand on savings and Social Security alone. Part-time
  work done later by choice is a bonus, not something the plan depends on.

## Using it

- **Enter your numbers** on the left. The left side starts with example numbers: a box still holding the
  example's number has a blue edge, and a section with any left has a blue dot. Empty a box to put the
  example's number back. Hover the **?**
  next to any label to see what it means and where to find it. Press **Calculate** (about 5–10 seconds).
- **Plans** — `Plans…` → choose a folder once, ideally somewhere like `Documents\fire-plans`; plan files
  contain your financial details. *Save* updates the current plan; *Save as new* makes a copy. Next year:
  open last year's plan, *Save as new* ("2027 checkup"), click the banner's **Start plan in 2027**, update
  balances, salaries and contributions, **Calculate**. Each file holds your inputs, every assumption used,
  the data versions, and a results summary. Old results are never silently recomputed: a banner tells you if
  the app's data or calculator is newer than a plan's results. Until you press **Recalculate**, only the
  saved details are shown, and saving again keeps the plan marked as out of date. Saving into a folder needs
  **Chrome or Edge**; other browsers download and open plan files instead.
- **Your numbers stay in your browser.** The plan on screen is kept in the browser's own storage between
  visits, not on any server. On a shared computer, open `Plans…` and choose *Start over* when you're done.
- **Before you act on these numbers** — directly below the cards, one line for each caution that applies:
  the balance each date assumes you'll have, borderline dates, how often a plan pays the early-withdrawal
  penalty, and what Coast assumes.
- **Try a different retirement year** — below that, pick a FIRE type and a year (type it or use − / +) to
  see your chance of success, your savings over time in typical and bad markets, what's in each account in
  a bad market, the worst years to have started, and a year-by-year table of where each year's money comes
  from, the taxes paid and what is reinvested.
- **How this works** — generated from the plan on screen: every assumption, whether it's a default or
  yours, why, and the source.

## Run it yourself

The site above is the built app, published from this repository by GitHub Pages (`.github/workflows/pages.yml`
builds `dist/` on every push to `main`). To run it from the source code instead, you need
[Node.js](https://nodejs.org/) 22.18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5391.

## Build a permanent copy

The steps above run a development server from the source code. For a copy you can keep using without it:

```bash
npm run build
```

This creates a self-contained `dist/` folder. To use it, **double-click `Start FIRE Planner.cmd`** inside
`dist/`. It opens the planner in your browser at http://localhost:4391; keep the small window it opens
while you use the planner, and close it when you're done. It needs nothing else installed: no Node.js,
no terminal, no internet.

You can copy the whole `dist/` folder anywhere (e.g. `Documents\FIRE Planner`) and start it from there
the same way. Tip: right-click `Start FIRE Planner.cmd` → *Send to* → *Desktop (create shortcut)*.

Notes:
- Opening `dist/index.html` directly does **not** work: browsers only run the app's background
  calculator from a web address, which is what the launcher provides.
- `dist/` is not in git. Rebuild (and re-copy) after pulling changes or after the yearly data update.
- The built copy (port 4391), the development server (port 5391) and the public site count as different
  websites to the browser: each asks you to choose your plans folder once and keeps its own unsaved draft.
  Your plan files themselves are shared.
- From a terminal, `npm run preview` serves the same `dist/` folder at the same address.

## Keeping the numbers current

Market history, tax brackets and Social Security rules change every year. See
[Yearly data update](docs/DEVELOPMENT.md#yearly-data-update).

## More

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — project layout, scripts, tests, data updates
- [docs/DESIGN.md](docs/DESIGN.md) — what the calculator does and how each result is defined
- [docs/DECISIONS.md](docs/DECISIONS.md) — every assumption and judgement call, and where to change it

## Limitations (v1)

Both spouses assumed alive through the plan (no survivor modeling) and retiring in the same year; no ACA
subsidies or IRMAA; US market data only; flat state tax; no 72(t)/Rule of 55; no flexible-spending
(guardrail) rules; no plan comparison view. The app's **How this works** page lists these under "What this doesn't model". See
[docs/pending-features.md](docs/pending-features.md) for planned work.

This is a personal planning tool, not financial advice.

## License

[MIT](LICENSE)

Favicon: "Fire" from [Fluent Emoji](https://github.com/microsoft/fluentui-emoji), © Microsoft Corporation, MIT License.

Section and card icons from [Lucide](https://lucide.dev), © Lucide Contributors, ISC License.
