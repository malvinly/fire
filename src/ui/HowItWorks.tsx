import { Fragment, useEffect } from 'react';
import { DATA_VERSIONS, describeAssumptions } from '../engine/assumptions';
import { REPO_URL } from '../version';
import { MARKET } from '../engine/returns';
import type { Plan } from '../engine/types';


const groupId = (g: string) => `group-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** `focusGroup`: a group to scroll to on opening (the warnings panel links to the limitations). */
export function HowItWorks({ plan, focusGroup }: { plan: Plan; focusGroup?: string | null }) {
  const rows = describeAssumptions(plan);
  const groups = [...new Set(rows.map((r) => r.group))];
  useEffect(() => {
    if (focusGroup) document.getElementById(groupId(focusGroup))?.scrollIntoView({ block: 'start' });
  }, [focusGroup]);
  return (
    <div className="page">
      <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <h2>How this works</h2>
        <p>
          The calculator simulates your household year by year: contributions while you work, then spending, healthcare,
          Social Security, withdrawals, Roth conversions and taxes in retirement. It runs that plan through{' '}
          {plan.assumptions.paths.toLocaleString()} simulated markets (each stitched together from random {plan.assumptions.blockLength}-year
          chunks of real US history since {MARKET.firstYear}) and through every real stretch of history long enough to cover your plan. A plan "succeeds" if money never runs out before the younger of you
          turns {plan.assumptions.endAge}. Each FIRE result is the earliest date or smallest portfolio that reaches{' '}
          {Math.round(plan.assumptions.targetSuccess * 100)}% under <b>both</b> methods.
        </p>
        <p className="text-2">
          Everything below is generated from the settings of the plan on screen, so it always matches the numbers you see.
          Data: market history through {DATA_VERSIONS.marketThrough}, {DATA_VERSIONS.rulesYear} tax and Social Security rules,{' '}
          {DATA_VERSIONS.trusteesReport} Trustees Report. Decision numbers (D1…) refer to the project's{' '}
          <a href={`${REPO_URL}/blob/main/docs/DECISIONS.md`} target="_blank" rel="noreferrer">decisions log</a>.
        </p>
      </div>
      <table className="assumptions">
        <thead>
          <tr><th>Assumption</th><th>Value used</th><th /><th>Why</th><th>Source</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr className="group" id={groupId(g)}><td colSpan={5}>{g}</td></tr>
              {rows.filter((r) => r.group === g).map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td><b>{r.value}</b></td>
                  <td>
                    {r.status !== 'fixed' && <span className={`tag ${r.status}`}>{r.status === 'default' ? 'default' : 'yours'}</span>}
                  </td>
                  <td className="text-2">{r.why}{r.decision && <span className="muted"> ({r.decision})</span>}</td>
                  <td>{r.source ? (r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer">{r.source.label}</a> : r.source.label) : ''}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

