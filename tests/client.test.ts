// Worker requests superseded by newer ones are cancelled, not queued (D80).
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { examplePlan } from '../src/engine/defaults';

type Sent = { id: number; type: string; year?: number; tier?: string };

class FakeWorker {
  static all: FakeWorker[] = [];
  sent: Sent[] = [];
  terminated = false;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message: string; preventDefault(): void }) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: Sent) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(result: unknown) {
    const last = this.sent[this.sent.length - 1];
    this.onmessage!({ data: { id: last.id, ok: true, result } });
  }
  crash() {
    this.onerror!({ message: 'boom', preventDefault() {} });
  }
}

let client: typeof import('../src/worker/client');
const plan = examplePlan(2026);
const live = () => FakeWorker.all.filter((w) => !w.terminated);
const holding = (pred: (m: Sent) => boolean) => live().find((w) => w.sent.some(pred))!;

beforeAll(async () => {
  vi.stubGlobal('Worker', FakeWorker);
  client = await import('../src/worker/client');
});

describe('worker requests', () => {
  test('a newer detail request replaces the worker still busy with the old one', async () => {
    expect(live()).toHaveLength(4); // three solvers and one for the detail view
    const first = client.detail(plan, 'traditional', 2040);
    const busy = holding((m) => m.year === 2040);
    const second = client.detail(plan, 'traditional', 2041);
    await expect(first).rejects.toBeInstanceOf(client.CancelledError);
    expect(busy.terminated).toBe(true);
    holding((m) => m.year === 2041).reply('detail 2041');
    await expect(second).resolves.toBe('detail 2041');
    expect(live()).toHaveLength(4);
  });

  test('an idle worker is kept', async () => {
    const before = FakeWorker.all.length;
    const p = client.detail(plan, 'traditional', 2042);
    holding((m) => m.year === 2042).reply('ok');
    await p;
    const q = client.detail(plan, 'traditional', 2043);
    expect(FakeWorker.all.length).toBe(before);
    holding((m) => m.year === 2043).reply('ok');
    await q;
  });

  test('a detail request never touches the solvers', async () => {
    const solving = client.solveAll(plan, () => {});
    const solvers = live().filter((w) => w.sent.some((m) => m.type === 'solve'));
    expect(solvers).toHaveLength(3);
    const d = client.detail(plan, 'coast', 2030);
    expect(solvers.every((w) => !w.terminated)).toBe(true);
    for (const w of solvers) w.reply({ tier: 'x' });
    await expect(solving).resolves.toHaveLength(3);
    holding((m) => m.year === 2030).reply('ok');
    await d;
  });

  test('a new calculation cancels every solve and detail request left over from before', async () => {
    const stale = client.detail(plan, 'traditional', 2044);
    const oldSolve = client.solveAll(plan, () => {});
    await expect(stale).rejects.toBeInstanceOf(client.CancelledError);
    const oldSolvers = live().filter((w) => w.sent.some((m) => m.type === 'solve'));
    const newSolve = client.solveAll(plan, () => {});
    await expect(oldSolve).rejects.toBeInstanceOf(client.CancelledError);
    expect(oldSolvers.every((w) => w.terminated)).toBe(true);
    for (const w of live().filter((x) => x.sent.some((m) => m.type === 'solve'))) w.reply({ tier: 'x' });
    await expect(newSolve).resolves.toHaveLength(3);
  });

  test('a worker that keeps crashing without replying stops restarting until the next request', async () => {
    const d = client.detail(plan, 'traditional', 2045);
    const w1 = holding((m) => m.year === 2045);
    w1.crash();
    await expect(d).rejects.toThrow(/stopped unexpectedly/);
    const before = FakeWorker.all.length; // w1 was replaced once
    FakeWorker.all[before - 1].crash(); // the replacement dies before replying too
    expect(FakeWorker.all.length).toBe(before); // no third start on its own
    const again = client.detail(plan, 'traditional', 2046); // the next request tries again
    expect(FakeWorker.all.length).toBe(before + 1);
    holding((m) => m.year === 2046).reply('ok');
    await expect(again).resolves.toBe('ok');
  });
});
