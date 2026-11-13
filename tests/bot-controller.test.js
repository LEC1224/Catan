import test from 'node:test';
import assert from 'node:assert/strict';
import { attachBotController } from '../src/bots/controller.js';
import { createBotEvaluator } from '../src/bots/worker.js';
import { createGame, viewGame } from '../server/game.js';

function controller(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let worker;
  const originalWorker = globalThis.Worker;
  globalThis.Worker = class {
    messages = [];
    constructor() { worker = this; }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data: { key: this.messages.at(-1).key, ...data } }); }
  };
  const listeners = new Map(), sends = [], errors = [];
  const socket = {
    connected: true,
    on(event, handler) { listeners.set(event, handler); },
    off(event) { listeners.delete(event); },
    timeout() { return this; },
    emit(event, payload, acknowledge) { sends.push({ event, payload, acknowledge }); },
  };
  const stop = attachBotController(socket, error => errors.push(error));
  const update = revision => listeners.get('botState')({ lobbyId: 'room', matchId: 'match', lease: 'lease', revision, bots: [] });
  t.after(() => {
    stop();
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });
  return { worker, socket, listeners, sends, errors, update, stop };
}

test('idle bot observations sleep until the revision changes instead of polling', t => {
  const { worker, update } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  worker.reply({ action: null });
  t.mock.timers.tick(60_000);
  assert.equal(worker.messages.length, 1, 'a human turn does not keep cloning observations');
  update(1);
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 1, 'presence updates do not restart thinking');
  update(2);
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 2);
});

test('a pending bot trade wakes exactly when its response window expires', t => {
  const { worker, update } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  worker.reply({ action: null, retryAfter: 6000 });
  t.mock.timers.tick(5999);
  assert.equal(worker.messages.length, 1);
  t.mock.timers.tick(1);
  assert.equal(worker.messages.length, 2);
});

test('a new revision supersedes an old trade wake-up and an unfinished decision', t => {
  const { worker, update, sends } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  update(2);
  t.mock.timers.tick(1000);
  assert.equal(worker.messages.length, 1, 'only one worker decision may run at once');
  worker.reply({ action: { type: 'endTurn' }, botId: 'bot' });
  assert.equal(sends.length, 0, 'a stale decision is not sent to the server');
  t.mock.timers.tick(700);
  assert.equal(worker.messages.at(-1).state.revision, 2);
  worker.reply({ action: null, retryAfter: 6000 });
  update(3);
  t.mock.timers.tick(700);
  assert.equal(worker.messages.at(-1).state.revision, 3);
});

test('successful bot actions are not repeated while waiting for the next observation', t => {
  const { worker, update, sends } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  worker.reply({ botId: 'bot', action: { type: 'endTurn' } });
  sends[0].acknowledge(null, { ok: true });
  t.mock.timers.tick(60_000);
  assert.equal(worker.messages.length, 1);
  update(2);
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 2);
  worker.reply({ botId: 'bot', action: { type: 'rollDice' } });
  update(3);
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 2, 'wait for the current acknowledgement');
  sends[1].acknowledge(null, { ok: true });
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 3);
});

test('a failed acknowledgement reconciles state before a bounded retry', t => {
  const { worker, update, sends, errors } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  worker.reply({ botId: 'bot', action: { type: 'endTurn' } });
  sends[0].acknowledge(new Error('timeout'));
  assert.equal(sends[1].event, 'syncBots');
  assert.deepEqual(errors, []);
  t.mock.timers.tick(1499);
  assert.equal(worker.messages.length, 1);
  t.mock.timers.tick(1);
  assert.equal(worker.messages.length, 2);
});

test('disconnect and disposal suppress delayed bot actions', t => {
  const { worker, socket, listeners, update, sends, stop } = controller(t);
  update(1);
  t.mock.timers.tick(700);
  socket.connected = false;
  listeners.get('disconnect')();
  worker.reply({ botId: 'bot', action: { type: 'endTurn' } });
  t.mock.timers.tick(60_000);
  assert.equal(sends.length, 0);
  socket.connected = true;
  update(2);
  stop();
  t.mock.timers.tick(700);
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.terminated, true);
  assert.equal(listeners.size, 0);
});

test('worker evaluation reports only the remaining trade wait and resets memory for a new match', () => {
  const game = createGame([{ id: 'human' }, { id: 'bot' }], { seed: 'worker', allowPlayerTrading: true });
  game.phase = 'action';
  game.activePlayerId = 'human';
  const evaluate = createBotEvaluator();
  const observation = (matchId = 'match') => ({ key: 'key', state: {
    matchId, bots: [{ id: 'bot', difficulty: 'normal', game: viewGame(game, 'bot') }],
  } });
  assert.deepEqual(evaluate(observation(), 1000), { key: 'key', action: null });
  game.activePlayerId = 'bot';
  game.tradeOffers = [{ id: 'offer', from: 'bot', give: { wood: 1 }, want: { ore: 1 }, declinedBy: [] }];
  assert.deepEqual(evaluate(observation(), 1000), { key: 'key', action: null, retryAfter: 6000 });
  assert.deepEqual(evaluate(observation(), 6999), { key: 'key', action: null, retryAfter: 1 });
  assert.deepEqual(evaluate(observation(), 7000), { key: 'key', botId: 'bot', action: { type: 'cancelTrade', offerId: 'offer' } });
  assert.deepEqual(evaluate(observation('new-match'), 7000), { key: 'key', action: null, retryAfter: 6000 });
});
