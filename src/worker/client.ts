// Small pool of engine workers: the three tiers solve in parallel. A request superseded by a newer one is
// cancelled by replacing its worker, so old work never delays new work (D80).
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

  constructor() {
    this.start();
  }

  private start() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const { id, ok, result, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    // A crashed worker (e.g. out of memory) never replies: fail what it was doing and start a fresh one,
    // so Calculate doesn't stay stuck on "Calculating…".
    this.worker.onerror = (ev) => {
      ev.preventDefault();
      this.worker.terminate();
      const err = new Error(`The calculation stopped unexpectedly${ev.message ? `: ${ev.message}` : ''}.`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      this.start();
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
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id });
    });
  }
}

const pool = [new EngineWorker(), new EngineWorker(), new EngineWorker()];
const TIERS: Tier[] = ['traditional', 'chubby', 'coast'];

export async function solveAll(plan: Plan, onTier: (r: TierResult) => void): Promise<TierResult[]> {
  for (const w of pool) w.cancel();
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

export function detail(plan: Plan, tier: Tier, year: number): Promise<Detail> {
  pool[0].cancel();
  return pool[0].request<Detail>({ type: 'detail', plan, tier, year });
}
