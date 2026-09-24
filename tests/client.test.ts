// Worker requests superseded by newer ones are cancelled, not queued (fix 24, D80).
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { examplePlan } from '../src/engine/defaults';

class FakeWorker {
  static all: FakeWorker[] = [];
  sent: { id: number; type: string; year?: number }[] = [];
  terminated = false;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: { id: number; type: string; year?: number }) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(result: unknown) {
    const last = this.sent[this.sent.length - 1];
    this.onmessage!({ data: { id: last.id, ok: true, result } });
  }
}

let client: typeof import('../src/worker/client');
const plan = examplePlan(2026);
const live = () => FakeWorker.all.filter((w) => !w.terminated);

beforeAll(async () => {
  vi.stubGlobal('Worker', FakeWorker);
  client = await import('../src/worker/client');
});

describe('worker requests', () => {
  test('a newer detail request replaces the worker still busy with the old one', async () => {
    const first = client.detail(plan, 'traditional', 2040);
    const busy = live()[0];
    const second = client.detail(plan, 'traditional', 2041);
    await expect(first).rejects.toBeInstanceOf(client.CancelledError);
    expect(busy.terminated).toBe(true);
    const fresh = live().find((w) => w.sent.some((m) => m.year === 2041))!;
    fresh.reply('detail 2041');
    await expect(second).resolves.toBe('detail 2041');
    expect(live()).toHaveLength(3);
  });

  test('an idle worker is kept', async () => {
    const before = FakeWorker.all.length;
    const p = client.detail(plan, 'traditional', 2042);
    live().find((w) => w.sent.some((m) => m.year === 2042))!.reply('ok');
    await p;
    const q = client.detail(plan, 'traditional', 2043);
    expect(FakeWorker.all.length).toBe(before);
    live().find((w) => w.sent.some((m) => m.year === 2043))!.reply('ok');
    await q;
  });

  test('a new calculation cancels work left over from the previous one', async () => {
    const stale = client.detail(plan, 'traditional', 2044);
    const solving = client.solveAll(plan, () => {});
    await expect(stale).rejects.toBeInstanceOf(client.CancelledError);
    for (const w of live()) w.reply({ tier: 'x' });
    await expect(solving).resolves.toHaveLength(3);
  });
});
