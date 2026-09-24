// Plan inputs and engine results. All money is in today's (real) dollars unless a field says otherwise.

export type PersonId = 'you' | 'spouse';

export interface EarningsYear {
  year: number;
  /** Taxed Social Security earnings for that year, nominal dollars, as shown on the SSA earnings record. */
  amount: number;
}

export interface Person {
  name: string;
  birthYear: number;
  /** 1-12. Used to prorate the first Social Security year. */
  birthMonth: number;
  /** Current gross salary. */
  salary: number;
  /** Annual contributions in today's dollars. */
  contributions: {
    pretax: number; // traditional 401(k)/403(b)/IRA
    employerMatch: number; // goes to pre-tax
    roth: number; // Roth 401(k)/IRA
    hsa: number;
  };
  balances: {
    pretax: number;
    roth: number;
    /** Portion of the Roth balance that is contributions (withdrawable anytime). */
    rothBasis: number;
    hsa: number;
  };
  socialSecurity: {
    /** 'record' computes the benefit from earnings; 'manual' uses manualPia. */
    mode: 'record' | 'manual';
    earnings: EarningsYear[];
    /** Monthly benefit at full retirement age from the SSA statement, today's dollars. */
    manualPia: number;
    claimAge: number; // 62-70
  };
  healthcare: {
    /** Annual cost before Medicare (ACA premium + out-of-pocket), today's dollars. */
    preMedicare: number;
    /** Annual cost from 65 (Part B + D + Medigap + out-of-pocket), today's dollars. */
    medicare: number;
  };
}

export type DatedTiming = { kind: 'year'; year: number } | { kind: 'age'; person: PersonId; age: number };

export interface DatedItem {
  id: string;
  label: string;
  direction: 'expense' | 'income';
  /** Annual (or one-time) amount, today's dollars unless `fixedDollars`. */
  amount: number;
  frequency: 'oneTime' | 'ongoing' | 'recurring';
  start: DatedTiming;
  /** Inclusive end for ongoing/recurring; omitted = until the plan ends. */
  end?: DatedTiming;
  /** Repeat interval in years for 'recurring'. */
  everyYears?: number;
  /** Fixed nominal dollars (e.g. mortgage principal & interest): shrinks with inflation. */
  fixedDollars: boolean;
}

export type BracketFill = 'none' | '10' | '12' | '22' | '24';

export interface Assumptions {
  endAge: number;
  targetSuccess: number; // 0-1
  allocation: { stocks: number; bonds: number; cash: number }; // fractions summing to 1
  feeRate: number;
  wageGrowth: number; // real
  healthcareInflation: number; // real, above CPI
  paths: number;
  searchPaths: number;
  blockLength: number;
  seed: number;
  stateTaxRate: number;
  bracketFill: BracketFill;
  ssTrustFund: { startYear: number; startPct: number; endYear: number; endPct: number };
}

export interface Plan {
  schemaVersion: 1;
  /** First simulated calendar year ("now"). Balances are as of the start of this year. */
  startYear: number;
  you: Person;
  spouse: Person;
  household: {
    taxable: number;
    taxableBasis: number;
    cash: number;
    taxableContribution: number;
    cashContribution: number;
    currentSpending: number;
    /** Traditional FIRE baseline retirement spending (excludes healthcare & dated items). */
    traditionalSpending: number;
    /** Chubby FIRE spending; empty (null) skips the Chubby result. Default = current × 1.2 (D48). */
    chubbySpending: number | null;
    /** Coast FIRE: age (of "you") at which work fully stops. */
    coastRetireAge: number;
  };
  datedItems: DatedItem[];
  assumptions: Assumptions;
}

/** One simulated scenario: when contributions stop, when work stops, and how much is spent. */
export interface Scenario {
  /** Calendar year contributions stop (first year with none). */
  stopContributingYear: number;
  /** Calendar year work stops (household retirement date). */
  retireYear: number;
  baseSpending: number;
}

export interface YearRecord {
  year: number;
  ageYou: number;
  ageSpouse: number;
  working: boolean;
  spending: number; // base + dated + healthcare (outflows)
  healthcare: number;
  socialSecurity: number;
  otherIncome: number;
  withdrawals: { cash: number; taxable: number; roth: number; pretax: number; hsa: number };
  conversions: number;
  rmd: number;
  penaltyWithdrawals: number;
  /** Ordinary income incl. taxable Social Security, before deductions. */
  ordinaryIncome: number;
  capitalGains: number;
  /** Federal taxable income after the standard deduction. */
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  penaltyTax: number;
  balances: { cash: number; taxable: number; pretax: number; roth: number; hsa: number; total: number };
  shortfall: number;
}

export interface PathOutcome {
  success: boolean;
  /** Calendar year money ran out, if it did. */
  failYear: number | null;
  usedPenalty: boolean;
  endBalance: number;
  minBalance: number;
}
