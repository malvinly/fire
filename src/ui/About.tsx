import { MIX_SOURCES, VANGUARD_PATH } from '../data/mixPaths';
import { DATA_VERSIONS } from '../engine/assumptions';
import { APP_VERSION, REPO_URL } from '../version';
import { vanguardPathFacts } from './mixText';

const V = MIX_SOURCES.vanguard;
const R = MIX_SOURCES.vanguardResearch;
const F = MIX_SOURCES.fidelity;

function Source({ src }: { src: { title: string; url: string } }) {
  return <a href={src.url} target="_blank" rel="noreferrer">{src.title}</a>;
}

/** The About tab: where your numbers go, whom the tool is for, and where the source lives (D90). */
export function About({ onHowItWorks }: { onHowItWorks: () => void }) {
  const path = vanguardPathFacts();
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
        <h3>Where the investment mix comes from</h3>
        <p>
          The default asset mix follows Vanguard's Target Retirement glide path. The glide-path chart and table in Vanguard's{' '}
          <Source src={V} /> ({V.date}) show stocks at {path.firstStocks}% until {path.firstYearsBefore} years before a fund's
          target year and at {path.targetStocks}% in it, and the prospectus says each fund reaches the mix of the Target
          Retirement Income fund, about {path.finalStocks}% stocks, within {path.finalYearsAfter} years after.
        </p>
        <p>
          The planner ties the path to the year the first person in the plan turns {VANGUARD_PATH.targetAge}. Vanguard's research
          paper <Source src={R} /> ({R.date}) describes the path as reaching "{R.quotes[0]}" and "{R.quotes[1]}", and lists a
          retirement age of 65 among its assumptions. That is what the path was designed around, so it is tied to
          age {VANGUARD_PATH.targetAge} rather than to your own retirement year; tied to an earlier retirement it would turn
          conservative years sooner. What this choice changes is measured in
          the <a href={`${REPO_URL}/blob/main/docs/DECISIONS.md`} target="_blank" rel="noreferrer">decisions log</a> (D97).
        </p>
        <p>
          The fixed mix is the one Fidelity's FI Planner uses: its <Source src={F} /> says "{F.quotes[0]}". This planner puts
          your accounts back to the mix once a year. "My own mix" is there for anything else.
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
