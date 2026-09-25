import { DATA_VERSIONS } from '../engine/assumptions';
import { APP_VERSION, REPO_URL } from '../version';

/** The About tab: where your numbers go, whom the tool is for, and where the source lives (D90). */
export function About({ onHowItWorks }: { onHowItWorks: () => void }) {
  return (
    <div className="page">
      <div style={{ display: 'grid', gap: 10 }}>
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
          situation is different, the assumptions under <button className="link" onClick={onHowItWorks}>How this works</button> may not fit it.
        </p>
        <p>
          The results are estimates, not financial advice.
        </p>
        <p className="text-2">
          Version {APP_VERSION} · market history through {DATA_VERSIONS.marketThrough} · {DATA_VERSIONS.rulesYear} tax and Social
          Security rules · {DATA_VERSIONS.trusteesReport} Trustees Report. The source code, every decision behind the numbers and
          the version history are at <a href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL.replace('https://', '')}</a>.
        </p>
      </div>
    </div>
  );
}
