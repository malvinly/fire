// Small pool of engine workers: the three tiers solve in parallel, and a fourth serves the detail view. A request
// superseded by a newer one is cancelled by replacing its worker, so old work never delays new work (D80).
import type { Detail, Tier, TierResult } from '../engine/solve';
import type { Plan } from '../engine/types';
import type { WorkerRequest } from './engine.worker';

// Omit 'id' from each member of the union separately.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestBody = DistributiveOmit<WorkerRequest, 'id'>;
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** The request was superseded by a newer one; nothing to report. */
export class CancelledError extends Error {
  constructor() {
    super('Superseded by a newer request.');
    this.name = 'CancelledError';
  }
}

class EngineWorker {
  private worker!: Worker;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  /** Crashes since the last reply. A worker that can't even load (a stale build) must not restart forever. */
  private failuresInARow = 0;
  private stopped = false;

  constructor() {
    this.start();
  }

  private start() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      this.failuresInARow = 0;
      const { id, ok, result, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    // A crashed worker (e.g. out of memory) never replies: fail what it was doing and start a fresh one,
    // so Calculate doesn't stay stuck on "Calculating…". After two crashes with no reply in between, wait for
    // the next request before trying again.
    this.worker.onerror = (ev) => {
      ev.preventDefault();
      this.worker.terminate();
      const err = new Error(`The calculation stopped unexpectedly${ev.message ? `: ${ev.message}` : ''}. Reload the page if this keeps happening.`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.failuresInARow++;
      if (this.failuresInARow < 2) this.start();
      else this.stopped = true;
    };
  }

  /** Abandons whatever this worker is doing (a running calculation can't be interrupted, so the worker is replaced). */
  cancel() {
    if (this.pending.size === 0) return;
    this.worker.terminate();
    const err = new CancelledError();
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.start();
  }

  request<T>(req: RequestBody): Promise<T> {
    if (this.stopped) {
      this.stopped = false;
      this.failuresInARow = 0;
      this.start();
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id });
    });
  }
}

const pool = [new EngineWorker(), new EngineWorker(), new EngineWorker()];
/** Separate from the solvers, so cancelling a stale detail request can never cancel a solve. */
const detailWorker = new EngineWorker();
const TIERS: Tier[] = ['traditional', 'chubby', 'coast'];

/** Solves every tier. Anything still running from before (solves or a detail request) is cancelled first. */
export async function solveAll(plan: Plan, onTier: (r: TierResult) => void): Promise<TierResult[]> {
  for (const w of [...pool, detailWorker]) w.cancel();
  const tiers = TIERS.filter((t) => t !== 'chubby' || (plan.household.chubbySpending ?? 0) > 0);
  return Promise.all(
    tiers.map((tier, i) =>
      pool[i].request<TierResult>({ type: 'solve', plan, tier }).then((r) => {
        onTier(r);
        return r;
      }),
    ),
  );
}

/** The detail view for one tier and year; a newer call cancels one still running. */
export function detail(plan: Plan, tier: Tier, year: number): Promise<Detail> {
  detailWorker.cancel();
  return detailWorker.request<Detail>({ type: 'detail', plan, tier, year });
}
