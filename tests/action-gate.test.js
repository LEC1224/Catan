import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionGate } from '../src/action-gate.js';

test('overlapping UI actions submit once, return false for duplicates, and never queue stale moves', async () => {
  const run = createActionGate();
  let acknowledge, calls = 0;
  const submit = () => { calls++; return new Promise(resolve => { acknowledge = resolve; }); };
  const first = run(submit);
  assert.equal(await run(submit), false);
  assert.equal(await run(submit), false);
  assert.equal(calls, 1);
  const result = { ok: true };
  acknowledge(result);
  assert.equal(await first, result);
  assert.equal(calls, 1, 'duplicate moves are dropped rather than replayed against a new phase');
  assert.equal(await run(() => 'next action'), 'next action');
});

test('rejected or failed actions release the gate for a deliberate retry', async () => {
  const run = createActionGate();
  assert.equal(await run(() => false), false);
  await assert.rejects(run(() => { throw new Error('disconnected'); }), /disconnected/);
  await assert.rejects(run(() => Promise.reject(new Error('timeout'))), /timeout/);
  assert.equal(await run(() => true), true);
});

test('independent chat and game gates do not block each other', async () => {
  const game = createActionGate(), chat = createActionGate();
  let complete;
  const move = game(() => new Promise(resolve => { complete = resolve; }));
  assert.equal(await chat(() => 'message'), 'message');
  complete(true);
  assert.equal(await move, true);
});
