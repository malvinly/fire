// The built-in choices for "Asset mix over time" (D97). Refresh once a year with the other data (see
// docs/UPDATE_DATA_PROMPT.md): check the Vanguard prospectus's glide path and Fidelity's methodology.

/** Vanguard Target Retirement glide path: stock share by years from the target year; straight lines between points, flat outside; the rest is bonds, no cash. */
export const VANGUARD_PATH = {
  targetAge: 65,
  points: [{ years: -25, stocks: 0.9 }, { years: -5, stocks: 0.6 }, { years: 0, stocks: 0.5 }, { years: 7, stocks: 0.3 }],
};

/** The mix Fidelity's FI Planner uses, every year. */
export const FIDELITY_MIX = { stocks: 0.7, bonds: 0.25, cash: 0.05 };

const VANGUARD_PROSPECTUS = { title: 'Target Retirement Funds prospectus', date: 'January 28, 2026' };
const VANGUARD_RESEARCH = { title: 'Choice of equity landing points can benefit target-date investors', date: 'May 2025' };

/**
 * Where the built-in choices come from; shown on the About page, in "How this works" and in help. `label` is the full
 * citation ("How this works"); `title` and `date` are the About page's link text and date.
 */
export const MIX_SOURCES = {
  vanguard: {
    label: `Vanguard ${VANGUARD_PROSPECTUS.title}, ${VANGUARD_PROSPECTUS.date} (glide path chart and table)`,
    url: 'https://www.sec.gov/Archives/edgar/data/752177/000119312526024962/f43837d1.htm',
    ...VANGUARD_PROSPECTUS,
  },
  fidelity: {
    label: 'Fidelity FI Planner methodology',
    url: 'https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/FI_Planner_Methodology.pdf',
    title: 'methodology',
  },
  vanguardResearch: {
    label: `Vanguard research paper “${VANGUARD_RESEARCH.title}”, ${VANGUARD_RESEARCH.date}`,
    url: 'https://workplace.vanguard.com/content/dam/inst/iig-transformation/insights/pdf/2025/231657-02_TDF_PTDF_OTH-TRIGT-Research.pdf',
    ...VANGUARD_RESEARCH,
  },
};
