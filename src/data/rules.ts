// Tax, Social Security and RMD rules. Refresh once a year (see docs/UPDATE_DATA_PROMPT.md).
// Dollar amounts are for RULES_YEAR and are treated as constant in real terms unless marked "not indexed".

export const RULES_YEAR = 2026;

// IRS Rev. Proc. 2025-32 (2026, incl. One Big Beautiful Bill Act changes) — married filing jointly.
export const FEDERAL = {
  standardDeduction: 32_200,
  additional65PerPerson: 1_650,
  /** [upper bound of bracket, rate]; last bracket unbounded. */
  ordinaryBrackets: [
    [24_800, 0.1],
    [100_800, 0.12],
    [211_400, 0.22],
    [403_550, 0.24],
    [512_450, 0.32],
    [768_700, 0.35],
    [Infinity, 0.37],
  ] as const,
  /** Long-term capital gains: taxable-income thresholds where 15% and 20% begin. */
  ltcg0Top: 98_900,
  ltcg15Top: 613_700,
  /** Not indexed to inflation (statutory since 1984/1993). */
  ssThreshold1: 32_000,
  ssThreshold2: 44_000,
  /** Net investment income tax threshold, not indexed. */
  niitThreshold: 250_000,
  niitRate: 0.038,
  earlyWithdrawalPenalty: 0.1,
  hsaNonMedicalPenalty: 0.2,
};

// IRS 2026 contribution limits. The engine caps contributions at these every year (D15); the inputs panel also warns.
export const LIMITS = {
  employee401k: 24_500,
  catchUp401k: 8_000, // age 50+
  ira: 7_500,
  iraCatchUp: 1_100,
  hsaFamily: 8_750,
  hsaCatchUp: 1_000, // age 55+
};

// SSA 2026 determinations (Federal Register 2025-19763) and national average wage index series.
// PAIRING RULE: bend points for first-eligibility year Y are computed by SSA from AWI(Y-2). Keep
// `awiLatestYear` = (year of the bend points) - 2. SSA publishes AWI(Y-1) in October of year Y together with
// the bend points for Y+1 — update both at once, or neither.
export const SOCIAL_SECURITY = {
  bendPoints: [1_286, 7_749] as const,
  taxableMax: 184_500,
  awiLatestYear: 2024,
  /** National average wage index, 1951-2024 (ssa.gov/oact/cola/AWI.html). */
  awi: {
    1951: 2799.16, 1952: 2973.32, 1953: 3139.44, 1954: 3155.64, 1955: 3301.44, 1956: 3532.36, 1957: 3641.72,
    1958: 3673.8, 1959: 3855.8, 1960: 4007.12, 1961: 4086.76, 1962: 4291.4, 1963: 4396.64, 1964: 4576.32,
    1965: 4658.72, 1966: 4938.36, 1967: 5213.44, 1968: 5571.76, 1969: 5893.76, 1970: 6186.24, 1971: 6497.08,
    1972: 7133.8, 1973: 7580.16, 1974: 8030.76, 1975: 8630.92, 1976: 9226.48, 1977: 9779.44, 1978: 10556.03,
    1979: 11479.46, 1980: 12513.46, 1981: 13773.1, 1982: 14531.34, 1983: 15239.24, 1984: 16135.07,
    1985: 16822.51, 1986: 17321.82, 1987: 18426.51, 1988: 19334.04, 1989: 20099.55, 1990: 21027.98,
    1991: 21811.6, 1992: 22935.42, 1993: 23132.67, 1994: 23753.53, 1995: 24705.66, 1996: 25913.9,
    1997: 27426.0, 1998: 28861.44, 1999: 30469.84, 2000: 32154.82, 2001: 32921.92, 2002: 33252.09,
    2003: 34064.95, 2004: 35648.55, 2005: 36952.94, 2006: 38651.41, 2007: 40405.48, 2008: 41334.97,
    2009: 40711.61, 2010: 41673.83, 2011: 42979.61, 2012: 44321.67, 2013: 44888.16, 2014: 46481.52,
    2015: 48098.63, 2016: 48642.15, 2017: 50321.89, 2018: 52145.8, 2019: 54099.99, 2020: 55628.6,
    2021: 60575.07, 2022: 63795.13, 2023: 66621.8, 2024: 69846.57,
  } as Record<number, number>,
};

// 2026 Social Security Trustees Report (OASI): depletion late 2032, 78% payable then, 62% by 2100.
export const TRUST_FUND_DEFAULT = { startYear: 2032, startPct: 0.78, endYear: 2100, endPct: 0.62 };

/** IRS Uniform Lifetime Table (2022+), age -> distribution period. */
export const UNIFORM_LIFETIME: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4,
  82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5,
  92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6,
  103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3,
  113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

export function rmdStartAge(birthYear: number): number {
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}

/** Full retirement age in months for a birth year. */
export function fullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear >= 1960) return 67 * 12;
  return 66 * 12 + (birthYear - 1954) * 2;
}
