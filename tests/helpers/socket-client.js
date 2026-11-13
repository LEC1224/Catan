import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';

export const call = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);

// One browser identity per connection unless a test explicitly reuses its token.
// Flush the initial snapshot so callers can inspect lobby/botState immediately.
export async function connect(port, token = randomUUID()) {
  const socket = io(`http://127.0.0.1:${port}`, {
    auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false,
  });
  socket.token = token;
  socket.on('lobby', lobby => { socket.lobby = lobby; });
  socket.on('botState', state => { socket.botState = state; });
  try {
    const session = await new Promise((resolve, reject) => {
      socket.once('session', resolve);
      socket.once('connect_error', reject);
    });
    socket.playerId = session.playerId;
    await call(socket, 'getDirectory');
    return socket;
  } catch (error) {
    socket.disconnect();
    throw error;
  }
}

export async function eventually(predicate, description = 'condition reached') {
  const until = Date.now() + 2000;
  while (!predicate() && Date.now() < until) await delay(5);
  assert.ok(predicate(), description);
}
