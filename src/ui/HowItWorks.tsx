import { Fragment, useEffect } from 'react';
import { ABOUT_GROUP, DATA_VERSIONS, describeAssumptions } from '../engine/assumptions';
import { APP_VERSION, REPO_URL } from '../version';
import { MARKET } from '../engine/returns';
import type { Plan } from '../engine/types';


const groupId = (g: string) => `group-${g.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** `focusGroup`: a group to scroll to on opening (the warnings panel links to the limitations, the footer to About). */
export function HowItWorks({ plan, focusGroup }: { plan: Plan; focusGroup?: string | null }) {
  const rows = describeAssumptions(plan);
  const groups = [...new Set(rows.map((r) => r.group))];
  useEffect(() => {
    if (focusGroup) document.getElementById(groupId(focusGroup))?.scrollIntoView({ block: 'start' });
  }, [focusGroup]);
  return (
    <div className="page">
      <div id={groupId(ABOUT_GROUP)} className="about" style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        <h2>About this planner</h2>
        <p>
          FIRE Planner runs entirely in your browser. Nothing you enter is sent anywhere: there are no accounts, no cookies and
          no analytics, and the only thing downloaded is the page itself. The plan on screen is kept in this browser's storage
          between visits; on a shared computer, open <b>Plans…</b> and choose <b>Start over</b> when you're done.
        </p>
        <p>
          It is a personal tool. It was built around one household's situation and is published as is, not as a general
          calculator for everyone. It fits a US married couple filing jointly, with 401(k)/IRA, Roth and HSA accounts and
          Social Security, who want a retirement with room to enjoy it rather than the leanest possible one. That is also why
          there is no Lean, Fat or Barista FIRE: a bare-bones budget, a luxury budget funded by years of aggressive saving, and
          a plan that depends on part-time work in retirement are different plans from the one this tool tests. If your
          situation is different, the assumptions below may not fit it.
        </p>
        <p>
          The results are estimates, not financial advice. The source code, every decision behind the numbers and the version
          history are at <a href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL.replace('https://', '')}</a> (this is
          version {APP_VERSION}).
        </p>
      </div>
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

