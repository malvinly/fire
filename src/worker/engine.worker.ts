// Runs the engine off the main thread so the page stays responsive (D35).
import { detailFor, makeEngine, solveTier, type Engine, type Tier } from '../engine/solve';
import type { Plan } from '../engine/types';

export type WorkerRequest =
  | { id: number; type: 'solve'; plan: Plan; tier: Tier }
  | { id: number; type: 'detail'; plan: Plan; tier: Tier; year: number };

let cached: { key: string; engine: Engine } | null = null;

function engineFor(plan: Plan): Engine {
  const key = JSON.stringify(plan);
  if (!cached || cached.key !== key) cached = { key, engine: makeEngine(plan) };
  return cached.engine;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    const engine = engineFor(req.plan);
    const result = req.type === 'solve' ? solveTier(engine, req.tier) : detailFor(engine, req.tier, req.year);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
