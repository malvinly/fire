import { useCallback, useEffect, useRef, useState } from 'react';
import { examplePlan, untouchedSections } from './engine/defaults';
import { planEndYear } from './engine/context';
import { checkLoadedPlan, planProblems } from './engine/validate';
import type { Detail, Tier, TierResult } from './engine/solve';
import { MARKET } from './engine/returns';
import type { Plan } from './engine/types';
import { LIMITS_GROUP } from './engine/assumptions';
import { coastVerb } from './ui/format';
import { YearInput } from './ui/fields';
import { About } from './ui/About';
import { HowItWorks } from './ui/HowItWorks';
import { Icon, TIER_ICONS } from './ui/icons';
import { InputsPanel } from './ui/InputsPanel';
import { BeforeYouAct, DetailView, TIER_NAMES, TierCard } from './ui/Results';
import { SessionsDialog, type SessionMeta } from './ui/SessionsDialog';
import { applyTheme, systemTheme, type ThemeChoice } from './ui/theme';
import { DRAFT_KEY, REJECTED_DRAFT_KEY, describeProblems, detailArea, detailSelection, downloadJson, isStale, makeSession, type SessionFile } from './ui/sessions';
import { beforeYouAct } from './ui/warnings';
import { CancelledError, detail as fetchDetail, solveAll } from './worker/client';

/** Wait this long after the last year-picker change before recalculating the detail view (D80). */
const DETAIL_DELAY_MS = 250;


interface Results {
  plan: Plan;
  calculatedAt: string;
  tiers: Partial<Record<Tier, TierResult>>;
  done: boolean;
}

interface Draft {
  plan?: Plan;
  meta?: SessionMeta | null;
  /** Why a saved draft couldn't be used, and the draft itself so it can be downloaded. */
  rejected?: string;
  rejectedText?: string;
}

function loadDraft(): Draft | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const loaded = checkLoadedPlan(draft?.plan);
    if (!loaded.plan) throw new Error(describeProblems(loaded.problems));
    return { plan: loaded.plan, meta: draft.meta ?? null };
  } catch (e) {
    if (raw === null) return null; // storage unavailable (private window etc.)
    try {
      localStorage.setItem(REJECTED_DRAFT_KEY, raw);
    } catch {
      // Nowhere to keep it.
    }
    return { rejected: e instanceof Error ? e.message : String(e), rejectedText: raw };
  }
}

export default function App() {
  const [draft] = useState(loadDraft);
  const [plan, setPlan] = useState<Plan>(() => draft?.plan ?? examplePlan());
  const [meta, setMeta] = useState<SessionMeta | null>(() => draft?.meta ?? null);
  const [tab, setTab] = useState<'plan' | 'how' | 'about'>('plan');
  const [theme, setTheme] = useState<ThemeChoice>(systemTheme);
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; applyTheme(next); setTheme(next); };
  // A "How this works" group to scroll to when opening that tab from a link.
  const [howFocus, setHowFocus] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [selTier, setSelTier] = useState<Tier>('traditional');
  const [selYear, setSelYear] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    draft?.rejected ? `Your unsaved draft couldn't be loaded, so the example plan is shown. ${draft.rejected}` : null);
  // The versions stale saved results were calculated with (D59), kept so saving them again doesn't mark them
  // current (D86); null when the results on screen aren't stale.
  const [staleVersions, setStaleVersions] = useState<SessionFile['dataVersions'] | null>(null);
  const staleData = staleVersions !== null;
  // When the results on screen came from a session file rather than this app's own calculation.
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  // The plan snapshot of the calculation in progress; opening or starting a session clears it so a late
  // result can't overwrite what is now on screen.
  const running = useRef<Plan | null>(null);

  // Keep a local draft so a page reload never loses typing (convenience only; sessions are the real store).
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ plan, meta }));
    } catch {
      // Storage unavailable (private window etc.) — fine.
    }
  }, [plan, meta]);

  const update = useCallback((fn: (d: Plan) => void) => {
    setPlan((p) => {
      const d = structuredClone(p);
      fn(d);
      return d;
    });
    setDirty(true);
  }, []);

  const inputsChanged = results !== null && JSON.stringify(results.plan) !== JSON.stringify(plan);

  const calculate = async () => {
    const problems = planProblems(plan);
    if (problems.length) {
      setError(`Fix these inputs first: ${describeProblems(problems)}`);
      return;
    }
    const snapshot = structuredClone(plan);
    running.current = snapshot;
    setError(null);
    setStaleVersions(null);
    setSavedAt(null);
    setDetail(null);
    setResults({ plan: snapshot, calculatedAt: new Date().toISOString(), tiers: {}, done: false });
    try {
      const tiers = await solveAll(snapshot, (r) =>
        setResults((cur) => (cur && cur.plan === snapshot ? { ...cur, tiers: { ...cur.tiers, [r.tier]: r } } : cur)),
      );
      if (running.current !== snapshot) return;
      running.current = null;
      setResults((cur) => (cur && cur.plan === snapshot ? { ...cur, done: true } : cur));
      const pick = tiers.find((t) => t.tier === selTier) ?? tiers[0];
      setSelTier(pick.tier);
      setSelYear(defaultYear(snapshot, pick));
    } catch (e) {
      if (running.current !== snapshot || e instanceof CancelledError) return;
      running.current = null;
      // Clear the half-finished run so Calculate is usable again after fixing the input.
      setResults(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Fetch the detail view whenever the selection changes, once the year picker has been still for a moment; a
  // newer request cancels the one in progress (D80). Stale saved results keep their saved detail instead, so it
  // can't disagree with the saved cards (D85); `openSession` clears the spinner, which this early return can't.
  useEffect(() => {
    if (!results?.done || staleData || selYear === null || !results.tiers[selTier]) return;
    let cancelled = false;
    setDetailLoading(true);
    const timer = setTimeout(() => {
      fetchDetail(results.plan, selTier, selYear)
        .then((d) => { if (!cancelled) setDetail(d); })
        .catch((e) => { if (!cancelled && !(e instanceof CancelledError)) setError(String(e)); })
        .finally(() => { if (!cancelled) setDetailLoading(false); });
    }, DETAIL_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [results, staleData, selTier, selYear]);

  const selectTier = (t: Tier) => {
    setSelTier(t);
    const r = results?.tiers[t];
    if (r && results) setSelYear(defaultYear(results.plan, r));
  };

  const sessionFor = (name: string, createdAt?: string): SessionFile => {
    const saved = results?.done && !inputsChanged ? { calculatedAt: results.calculatedAt, tiers: Object.values(results.tiers), detail } : null;
    return makeSession(name, plan, saved, createdAt, saved && staleVersions ? staleVersions : undefined);
  };

  const openSession = (s: SessionFile, m: SessionMeta) => {
    running.current = null;
    setPlan(s.plan);
    setMeta(m);
    setDirty(false);
    setError(null);
    setDetail(s.results?.detail ?? null);
    // Opening a session cancels any detail request still running (the effect's cleanup), and for stale results
    // the effect then returns early (D85), so nothing else would turn its spinner off.
    setDetailLoading(false);
    if (s.results) {
      const tiers = Object.fromEntries(s.results.tiers.map((t) => [t.tier, t]));
      setResults({ plan: s.plan, calculatedAt: s.results.calculatedAt, tiers, done: true });
      if (s.results.detail) {
        const sel = detailSelection(s.results.detail);
        setSelTier(sel.tier);
        setSelYear(sel.year);
      } else {
        // Don't carry the previous session's tier and year over to this plan.
        const r = tiers.traditional ?? s.results.tiers[0];
        if (r) {
          setSelTier(r.tier);
          setSelYear(defaultYear(s.plan, r));
        }
      }
    } else {
      setResults(null);
    }
    setStaleVersions(s.results && isStale(s) ? s.dataVersions : null);
    setSavedAt(s.results?.calculatedAt ?? null);
  };

  const newSession = () => {
    running.current = null;
    setPlan(examplePlan());
    setMeta(null);
    setResults(null);
    setDetail(null);
    setDirty(false);
    setStaleVersions(null);
    setSavedAt(null);
  };

  const tierOrder: Tier[] = ['traditional', 'chubby', 'coast'];
  const thisYear = new Date().getFullYear();
  const selResult = results?.tiers[selTier];
  // Any section with a field still holding the example's number shows the legend above the inputs (D64).
  const exampleSections = untouchedSections(plan);
  // The year picker stops the year before the plan ends (D76).
  const lastYear = results ? planEndYear(results.plan) - 1 : 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1><button type="button" className="brand" onClick={() => setTab('plan')}><img src="./favicon.svg" alt="" width={20} height={20} />FIRE Planner</button></h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>Plan</button>
          <button role="tab" aria-selected={tab === 'how'} onClick={() => { setHowFocus(null); setTab('how'); }}>How this works</button>
          <button role="tab" aria-selected={tab === 'about'} onClick={() => setTab('about')}>About</button>
        </nav>
        <span className="spacer" />
        <span className="text-2">
          {meta ? meta.name : 'Unsaved plan'}{dirty ? ' •' : ''}
        </span>
        <button className="btn icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light colours' : 'Switch to dark colours'}
          title={theme === 'dark' ? 'Switch to light colours' : 'Switch to dark colours'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="btn" onClick={() => setSessionsOpen(true)}>Plans…</button>
        <button className="btn primary" onClick={calculate} disabled={results !== null && !results.done}>
          {results && !results.done ? 'Calculating…' : 'Calculate'}
        </button>
      </header>

      {tab === 'how' ? (
        <main className="main"><HowItWorks plan={plan} focusGroup={howFocus} /></main>
      ) : tab === 'about' ? (
        <main className="main"><About onHowItWorks={() => { setHowFocus(null); setTab('how'); }} /></main>
      ) : (
        <main className="main">
          <aside className="inputs" aria-label="Inputs">
            {exampleSections.length > 0 && (
              <p className="example-legend"><span className="example-dot" aria-hidden="true" /> Marked boxes still hold example numbers. Swap in your own.</p>
            )}
            <InputsPanel plan={plan} update={update} />
          </aside>
          <section className="results" aria-label="Results">
            {error && <div className="banner warn"><Icon name="alert" /> {error}</div>}
            {draft?.rejectedText && (
              <div className="banner">
                The draft that couldn't be loaded is kept in this browser until another one is set aside.
                <button className="btn small" onClick={() => downloadJson('unsaved plan (could not be loaded).json', draft.rejectedText!)}>Download it</button>
              </div>
            )}
            {plan.startYear < thisYear && (
              <div className="banner warn">
                <Icon name="alert" /> This plan starts in {plan.startYear}. For a yearly checkup, move it to {thisYear} and
                update balances, salaries and contributions to today's numbers.
                <button className="btn small" onClick={() => update((d) => { d.startYear = thisYear; })}>Start plan in {thisYear}</button>
              </div>
            )}
            {staleData && (
              <div className="banner warn">
                <Icon name="alert" /> These results were calculated with older data or an older version of the calculator. Recalculate to update.
                <button className="btn small" onClick={calculate}>Recalculate</button>
              </div>
            )}
            {savedAt && !staleData && !inputsChanged && (
              <div className="banner">
                Showing the results saved in this session file (calculated {new Date(savedAt).toLocaleDateString()}), not a new calculation.
                <button className="btn small" onClick={calculate}>Recalculate</button>
              </div>
            )}
            {inputsChanged && results?.done && (
              <div className="banner warn">
                <Icon name="alert" /> Inputs changed since these results were calculated.
                <button className="btn small primary" onClick={calculate}>Recalculate</button>
              </div>
            )}
            {!results ? (
              <div className="empty">
                <h2>Enter your numbers on the left, then press Calculate.</h2>
                <p style={{ marginTop: 8 }}>
                  The left side is filled with example numbers. Replace them with yours, and hover the{' '}
                  <span className="help-btn" aria-label="question mark">?</span> next to any label to see what goes there.
                  Calculating takes about 10 seconds: each FIRE type is tested against{' '}
                  {plan.assumptions.paths.toLocaleString()} simulated markets and every real stretch of market history since&nbsp;{MARKET.firstYear}.
                </p>
                <p style={{ marginTop: 12 }}>
                  Everything runs in your browser; nothing you enter is sent anywhere. This planner was built around one household's
                  situation and is published as is, not as a tool for{' '}
                  <span style={{ whiteSpace: 'nowrap' }}>everyone: <button className="link" onClick={() => setTab('about')}>see About</button>.</span>
                </p>
              </div>
            ) : (
              <>
                <div className="cards">
                  {tierOrder.map((t) =>
                    t === 'chubby' && !results.plan.household.chubbySpending ? (
                      <div key={t} className="card">
                        <h2 className="with-icon"><Icon name={TIER_ICONS.chubby} />{TIER_NAMES.chubby}</h2>
                        <p className="text-2">Enter your Chubby FIRE spending under Spending (or use the default), then recalculate.</p>
                      </div>
                    ) : (
                      <TierCard key={t} r={results.tiers[t] ?? null} plan={results.plan} selected={selTier === t && results.done} onSelect={() => selectTier(t)} />
                    ),
                  )}
                </div>

                {results.done && (
                  <BeforeYouAct lines={beforeYouAct(results.plan, results.tiers)} onLimits={() => { setHowFocus(LIMITS_GROUP); setTab('how'); }} />
                )}

                {results.done && selResult && selYear !== null && (
                  <div className="panel">
                    <h2>Try a different {selTier === 'coast' ? coastVerb(results.plan).replaceAll(' ', '-') : 'retirement'} year</h2>
                    <p className="text-2" style={{ marginTop: 4 }}>
                      Starts at your earliest date. Change it to see what {selTier === 'coast' ? (coastVerb(results.plan) === 'stop saving' ? 'stopping saving' : 'cutting back saving') : 'retiring'} earlier or later does.
                    </p>
                    <div className="control-row">
                        <div className="field">
                          <label htmlFor="tier-select">FIRE type</label>
                          <select id="tier-select" value={selTier} onChange={(e) => selectTier(e.target.value as Tier)}>
                            {tierOrder.filter((t) => results.tiers[t]).map((t) => <option key={t} value={t}>{TIER_NAMES[t]}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="year-input">{selTier === 'coast' ? (coastVerb(results.plan) === 'stop saving' ? 'Stop saving in' : 'Cut back saving in') : 'Retire in'}</label>
                          <div className="row">
                            <button className="btn" aria-label="One year earlier" onClick={() => setSelYear((y) => Math.max(results.plan.startYear, (y ?? 0) - 1))}>−</button>
                            <YearInput id="year-input" value={selYear} min={results.plan.startYear} max={lastYear} onChange={setSelYear} />
                            <button className="btn" aria-label="One year later" disabled={selYear >= lastYear} onClick={() => setSelYear((y) => Math.min(lastYear, (y ?? 0) + 1))}>+</button>
                            <button className="btn" onClick={() => setSelYear(defaultYear(results.plan, selResult))}>Back to earliest</button>
                          </div>
                          <span className="hint">
                            {results.plan.you.name} {selYear - results.plan.you.birthYear} · {results.plan.spouse.name} {selYear - results.plan.spouse.birthYear}
                            {selYear >= lastYear && ` · ${lastYear} is the last year before the plan ends`}
                            {detailLoading && <> · <span className="spinner" /></>}
                          </span>
                        </div>
                    </div>
                  </div>
                )}
                {results.done && selResult && selYear !== null && detailArea(staleData, detail, selTier, selYear) === 'note' && (
                  <div className="banner">
                    The saved results don't include the details for this FIRE type and year. Recalculate to see them.
                    <button className="btn small" onClick={calculate}>Recalculate</button>
                  </div>
                )}
                {detail && detailArea(staleData, detail, selTier, selYear) === 'detail' && (
                  <DetailView plan={results.plan} detail={detail} loading={detailLoading} simpleNumber={results.tiers[detail.tier]?.simpleNumber} />
                )}
              </>
            )}
          </section>
        </main>
      )}

      <SessionsDialog
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        meta={meta}
        makeFile={sessionFor}
        onSaved={(m) => { setMeta(m); setDirty(false); }}
        onOpen={openSession}
        onNew={newSession}
      />
    </div>
  );
}

function defaultYear(plan: Plan, r: TierResult): number {
  if (r.earliest) return r.earliest.year;
  return r.tier === 'coast' ? plan.startYear : Math.max(plan.startYear, plan.you.birthYear + 65);
}
