import { useCallback, useEffect, useRef, useState } from 'react';
import { examplePlan, untouchedSections } from './engine/defaults';
import { migratePlan } from './engine/migrate';
import type { Detail, Tier, TierResult } from './engine/solve';
import { MARKET } from './engine/returns';
import type { Plan } from './engine/types';
import { HowItWorks } from './ui/HowItWorks';
import { Icon, TIER_ICONS } from './ui/icons';
import { InputsPanel } from './ui/InputsPanel';
import { BeforeYouAct, DetailView, TIER_NAMES, TierCard } from './ui/Results';
import { SessionsDialog, type SessionMeta } from './ui/SessionsDialog';
import { isStale, makeSession, type SessionFile } from './ui/sessions';
import { beforeYouAct } from './ui/warnings';
import { detail as fetchDetail, solveAll } from './worker/client';

const DRAFT_KEY = 'fire-planner:draft';

interface Results {
  plan: Plan;
  calculatedAt: string;
  tiers: Partial<Record<Tier, TierResult>>;
  done: boolean;
}

function loadDraft(): { plan: Plan; meta: SessionMeta | null } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return { ...draft, plan: migratePlan(draft.plan) };
  } catch {
    return null;
  }
}

export default function App() {
  const [draft] = useState(loadDraft);
  const [plan, setPlan] = useState<Plan>(() => draft?.plan ?? examplePlan());
  const [meta, setMeta] = useState<SessionMeta | null>(() => draft?.meta ?? null);
  const [tab, setTab] = useState<'plan' | 'how'>('plan');
  const [results, setResults] = useState<Results | null>(null);
  const [selTier, setSelTier] = useState<Tier>('traditional');
  const [selYear, setSelYear] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleData, setStaleData] = useState(false);
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
    const snapshot = structuredClone(plan);
    running.current = snapshot;
    setError(null);
    setStaleData(false);
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
      if (running.current !== snapshot) return;
      running.current = null;
      // Clear the half-finished run so Calculate is usable again after fixing the input.
      setResults(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Fetch the detail view whenever the selection changes.
  useEffect(() => {
    if (!results?.done || selYear === null || !results.tiers[selTier]) return;
    let cancelled = false;
    setDetailLoading(true);
    fetchDetail(results.plan, selTier, selYear)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [results, selTier, selYear]);

  const selectTier = (t: Tier) => {
    setSelTier(t);
    const r = results?.tiers[t];
    if (r && results) setSelYear(defaultYear(results.plan, r));
  };

  const sessionFor = (name: string, createdAt?: string): SessionFile =>
    makeSession(name, plan, results?.done && !inputsChanged ? { calculatedAt: results.calculatedAt, tiers: Object.values(results.tiers), detail } : null, createdAt);

  const openSession = (s: SessionFile, m: SessionMeta) => {
    running.current = null;
    setPlan(s.plan);
    setMeta(m);
    setDirty(false);
    setError(null);
    setDetail(s.results?.detail ?? null);
    if (s.results) {
      const tiers = Object.fromEntries(s.results.tiers.map((t) => [t.tier, t]));
      setResults({ plan: s.plan, calculatedAt: s.results.calculatedAt, tiers, done: true });
      if (s.results.detail) {
        setSelTier(s.results.detail.tier);
        setSelYear(s.results.detail.tier === 'coast' ? s.results.detail.scenario.stopContributingYear : s.results.detail.scenario.retireYear);
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
    setStaleData(!!s.results && isStale(s));
    setSavedAt(s.results?.calculatedAt ?? null);
  };

  const newSession = () => {
    running.current = null;
    setPlan(examplePlan());
    setMeta(null);
    setResults(null);
    setDetail(null);
    setDirty(false);
    setStaleData(false);
    setSavedAt(null);
  };

  const tierOrder: Tier[] = ['traditional', 'chubby', 'coast'];
  const thisYear = new Date().getFullYear();
  const selResult = results?.tiers[selTier];
  const exampleSections = untouchedSections(plan);

  return (
    <div className="app">
      <header className="topbar">
        <h1><img src="./favicon.svg" alt="" width={20} height={20} />FIRE Planner</h1>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>Plan</button>
          <button role="tab" aria-selected={tab === 'how'} onClick={() => setTab('how')}>How this works</button>
        </nav>
        <span className="spacer" />
        <span className="text-2">
          {meta ? meta.name : 'Unsaved session'}{dirty ? ' •' : ''}
        </span>
        <button className="btn" onClick={() => setSessionsOpen(true)}>Sessions…</button>
        <button className="btn primary" onClick={calculate} disabled={results !== null && !results.done}>
          {results && !results.done ? 'Calculating…' : 'Calculate'}
        </button>
      </header>

      {tab === 'how' ? (
        <main className="main"><HowItWorks plan={plan} /></main>
      ) : (
        <main className="main">
          <aside className="inputs" aria-label="Inputs">
            <InputsPanel plan={plan} update={update} />
          </aside>
          <section className="results" aria-label="Results">
            {error && <div className="banner warn"><Icon name="alert" /> {error}</div>}
            {exampleSections.length > 0 && (
              <div className="banner warn">
                <Icon name="alert" /> Still example numbers: {exampleSections.join(', ')}. Results use them until you replace
                them with yours.
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
                  The left side is filled with example numbers — replace them with yours. Hover the “?” next to any
                  label to see what goes there. Calculating takes about 10 seconds: each FIRE type is tested against{' '}
                  {plan.assumptions.paths.toLocaleString()} simulated markets and every real stretch of market history since {MARKET.firstYear}.
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

                {results.done && <BeforeYouAct lines={beforeYouAct(results.plan, results.tiers)} />}

                {results.done && selResult && selYear !== null && (
                  <div className="panel">
                    <h2>Try a different {selTier === 'coast' ? 'stop-saving' : 'retirement'} year</h2>
                    <p className="text-2" style={{ marginTop: 4 }}>
                      Starts at your earliest date. Change it to see what {selTier === 'coast' ? 'stopping saving' : 'retiring'} earlier or later does.
                    </p>
                    <div className="control-row">
                        <div className="field">
                          <label htmlFor="tier-select">FIRE type</label>
                          <select id="tier-select" value={selTier} onChange={(e) => selectTier(e.target.value as Tier)}>
                            {tierOrder.filter((t) => results.tiers[t]).map((t) => <option key={t} value={t}>{TIER_NAMES[t]}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="year-input">{selTier === 'coast' ? 'Stop saving in' : 'Retire in'}</label>
                          <div className="row">
                            <button className="btn" aria-label="One year earlier" onClick={() => setSelYear((y) => Math.max(results.plan.startYear, (y ?? 0) - 1))}>−</button>
                            <input id="year-input" type="number" style={{ width: 90 }} value={selYear}
                              onChange={(e) => { const v = Number(e.target.value); if (v >= results.plan.startYear) setSelYear(v); }} />
                            <button className="btn" aria-label="One year later" onClick={() => setSelYear((y) => (y ?? 0) + 1)}>+</button>
                            <button className="btn" onClick={() => setSelYear(defaultYear(results.plan, selResult))}>Back to earliest</button>
                          </div>
                          <span className="hint">
                            {results.plan.you.name} {selYear - results.plan.you.birthYear} · {results.plan.spouse.name} {selYear - results.plan.spouse.birthYear}
                            {detailLoading && <> · <span className="spinner" /></>}
                          </span>
                        </div>
                    </div>
                  </div>
                )}
                {detail && <DetailView plan={results.plan} detail={detail} loading={detailLoading} />}
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
