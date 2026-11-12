import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, action, viewGame, tick } from './game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLORS = ['#ce6849', '#3b8292', '#d6aa46', '#688761', '#9a79a9', '#e1d5be'];
export const DEFAULT_SETTINGS = { maxPlayers: 4, extendedBoard: false, victoryPoints: 10, discardThreshold: 7, hardHandLimit: 0, turnSeconds: 120, friendlyRobber: false, balancedNumbers: true, allowPlayerTrading: true, pairedTurns: true, seed: '' };
function cleanText(value, max, fallback = '') { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || fallback : fallback; }
export function validateSettings(input = {}, previous = DEFAULT_SETTINGS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid game settings.');
  const result = { ...previous };
  const ranges = { maxPlayers: [2, 6], victoryPoints: [3, 20], discardThreshold: [3, 30], hardHandLimit: [0, 50], turnSeconds: [0, 600] };
  for (const [key, [min, max]] of Object.entries(ranges)) if (key in input) {
    const value = input[key];
    if (!Number.isInteger(value) || value < min || value > max || (key === 'turnSeconds' && value > 0 && value < 30)) throw Error(`Invalid ${key} setting.`);
    result[key] = value;
  }
  if ('maxPlayers' in input && input.maxPlayers !== previous.maxPlayers && !('extendedBoard' in input)) result.extendedBoard = result.maxPlayers >= 5;
  for (const key of ['extendedBoard', 'friendlyRobber', 'balancedNumbers', 'allowPlayerTrading', 'pairedTurns']) if (key in input) {
    if (typeof input[key] !== 'boolean') throw Error(`Invalid ${key} setting.`);
    result[key] = input[key];
  }
  if ('seed' in input) result.seed = cleanText(input.seed, 64);
  return result;
}

export async function createAppServer({ port = 3000, host = '0.0.0.0', production = false, testMode = false, persistence = true, dataFile = path.join(root, '.runtime', 'lobbies.json') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 24_000, serveClient: false, allowRequest(req, callback) {
    const origin = req.headers.origin;
    if (!origin) return callback(null, true);
    try { callback(null, new URL(origin).host === req.headers.host); } catch { callback('Invalid origin', false); }
  } });
  const lobbies = new Map();
  const memberships = new Map();
  const sessions = new Map();
  const botControllers = new Map(); // Ephemeral, one browser tab per host; never persisted.
  const difficulties = ['easy', 'normal', 'hard'];
  let dirty = false, saving = null;
  if (persistence) {
    try {
      const data = JSON.parse(await readFile(dataFile, 'utf8'));
      for (const lobby of data.lobbies || []) {
        if (Date.now() - lobby.updatedAt > 7 * 86400000) continue;
        for (const player of lobby.players) { player.connected = false; player.disconnectedAt = Date.now(); if (!player.isBot) memberships.set(player.id, lobby.id); }
        lobbies.set(lobby.id, lobby);
      }
    } catch (error) { if (error.code !== 'ENOENT') console.warn('Could not restore saved lobbies:', error.message); }
  }
  async function save() {
    if (!persistence) return;
    if (saving) await saving;
    if (!dirty) return;
    dirty = false;
    const snapshot = JSON.stringify({ version: 1, lobbies: [...lobbies.values()] });
    saving = (async () => {
      try { await mkdir(path.dirname(dataFile), { recursive: true }); await writeFile(`${dataFile}.tmp`, snapshot); await rename(`${dataFile}.tmp`, dataFile); }
      catch (error) { dirty = true; console.error('Lobby save failed:', error.message); }
    })();
    await saving; saving = null;
  }
  function directory() { return [...lobbies.values()].filter(l => !l.isPrivate && l.players.some(p => p.connected)).map(l => ({ id: l.id, name: l.name, hostName: l.players.find(p => p.id === l.hostId)?.name || 'Host', playerCount: l.players.length, maxPlayers: l.settings.maxPlayers, status: l.status, settings: l.settings })); }
  function broadcastDirectory() { io.emit('directory', directory()); }
  function emitLobby(lobby) {
    lobby.updatedAt = Date.now(); dirty = true;
    const controllerId = sessions.get(lobby.hostId)?.values().next().value;
    let controller = botControllers.get(lobby.id);
    if (controller?.socketId !== controllerId || controller?.matchId !== lobby.matchId) {
      controller = { socketId: controllerId, matchId: lobby.matchId, lease: randomBytes(16).toString('hex') };
      botControllers.set(lobby.id, controller);
    }
    const bots = lobby.players.filter(p => p.isBot);
    for (const player of lobby.players) for (const socketId of sessions.get(player.id) || []) {
      io.to(socketId).emit('lobby', { ...lobby, botsPaused: bots.length > 0 && !controllerId, meId: player.id, game: lobby.game ? viewGame(lobby.game, player.id) : null });
      io.to(socketId).emit('botState', socketId === controllerId && bots.length && lobby.status === 'playing' ? {
        lobbyId: lobby.id, matchId: lobby.matchId, lease: controller.lease, revision: lobby.botRevision || 0,
        bots: bots.map(bot => ({ id: bot.id, difficulty: bot.difficulty, game: viewGame(lobby.game, bot.id) })),
      } : null);
    }
  }
  function commitAction(lobby, playerId, payload) {
    const candidate = structuredClone(lobby.game);
    action(candidate, playerId, payload.type, payload);
    lobby.game = candidate; lobby.botRevision = (lobby.botRevision || 0) + 1;
    if (candidate.phase === 'finished') lobby.status = 'finished';
    emitLobby(lobby); if (lobby.status === 'finished') broadcastDirectory();
  }
  function resetReady(lobby) { lobby.players.forEach(p => { p.ready = !!p.isBot || p.id === lobby.hostId; }); }
  function getLobby(playerId) { const lobby = lobbies.get(memberships.get(playerId)); if (!lobby) throw Error('Join a lobby first.'); return lobby; }
  function requireHost(lobby, playerId) { if (lobby.hostId !== playerId) throw Error('Only the lobby host can do that.'); }
  function waiting(lobby) { if (lobby.status !== 'waiting') throw Error('This match has already started.'); }
  function releasePlayer(lobby, playerId, force = false) {
    if (lobby.status === 'playing' && !force) throw Error('Your seat is reserved during this match. You can close the page and reconnect later.');
    lobby.players = lobby.players.filter(p => p.id !== playerId); memberships.delete(playerId);
    for (const socketId of sessions.get(playerId) || []) io.to(socketId).emit('lobby', null);
    if (!lobby.players.some(p => !p.isBot)) { lobbies.delete(lobby.id); botControllers.delete(lobby.id); }
    else { if (lobby.hostId === playerId) lobby.hostId = (lobby.players.find(p => !p.isBot && p.connected) || lobby.players.find(p => !p.isBot)).id; emitLobby(lobby); }
    dirty = true; broadcastDirectory();
  }
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Catan Tides', lobbies: lobbies.size }));
  app.get('/api/lobbies', (_req, res) => res.json(directory()));
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{20,128}$/.test(token)) return next(Error('A valid browser session is required. Please refresh.'));
    socket.data.playerId = createHash('sha256').update(token).digest('hex').slice(0, 24); next();
  });
  io.on('connection', socket => {
    const playerId = socket.data.playerId;
    if (!sessions.has(playerId)) sessions.set(playerId, new Set());
    sessions.get(playerId).add(socket.id);
    socket.emit('session', { playerId }); socket.emit('directory', directory());
    const oldLobby = lobbies.get(memberships.get(playerId));
    if (oldLobby) {
      const wasOffline = !oldLobby.players.some(p => p.connected);
      const p = oldLobby.players.find(p => p.id === playerId); p.connected = true; delete p.disconnectedAt;
      if (wasOffline && oldLobby.game?.deadline && oldLobby.status === 'playing') oldLobby.game.deadline = Date.now() + oldLobby.settings.turnSeconds * 1000;
      emitLobby(oldLobby); broadcastDirectory();
    }
    let actionTimes = [];
    function on(event, handler) { socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const now = Date.now(); actionTimes = actionTimes.filter(t => now - t < 10000);
        if (actionTimes.length >= 90) throw Error('Too many requests. Wait a moment and try again.');
        actionTimes.push(now);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
        const result = handler(payload); reply({ ok: true, playerId, ...result });
      } catch (error) { reply({ ok: false, error: error.message || 'That action could not be completed.' }); }
    }); }
    on('getDirectory', () => { socket.emit('directory', directory()); });
    on('createLobby', payload => {
      if (memberships.has(playerId)) throw Error('Leave your current lobby first.');
      if (lobbies.size >= 200) throw Error('The server is full. Please try again later.');
      const playerName = cleanText(payload.playerName, 24); if (!playerName) throw Error('Enter your display name.');
      let id; do { id = randomBytes(5).toString('hex').slice(0, 8).toUpperCase(); } while (lobbies.has(id));
      const lobby = { id, name: cleanText(payload.name, 48, `${playerName}’s lobby`), isPrivate: Boolean(payload.isPrivate), hostId: playerId, players: [{ id: playerId, name: playerName, color: COLORS[0], connected: true, ready: true }], settings: validateSettings(payload.settings), status: 'waiting', game: null, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      lobbies.set(id, lobby); memberships.set(playerId, id); emitLobby(lobby); broadcastDirectory(); return { id };
    });
    on('joinLobby', payload => {
      const id = cleanText(payload.id, 16).toUpperCase(); const lobby = lobbies.get(id); if (!lobby) throw Error('No lobby found with that code.');
      if (memberships.get(playerId) === id) { emitLobby(lobby); return { id }; }
      if (memberships.has(playerId)) throw Error('Leave your current lobby first.');
      waiting(lobby); if (lobby.players.length >= lobby.settings.maxPlayers) throw Error('This lobby is full.');
      const name = cleanText(payload.playerName, 24); if (!name) throw Error('Enter your name first.');
      if (lobby.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw Error('That name is already in this lobby. Choose another.');
      lobby.players.push({ id: playerId, name, color: COLORS.find(c => !lobby.players.some(p => p.color === c)), connected: true, ready: false });
      memberships.set(playerId, id); emitLobby(lobby); broadcastDirectory(); return { id };
    });
    on('leaveLobby', () => releasePlayer(getLobby(playerId), playerId));
    on('addBot', payload => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId); waiting(lobby);
      if (lobby.players.length >= lobby.settings.maxPlayers) throw Error('This lobby is full.');
      const difficulty = payload.difficulty ?? 'normal';
      if (!difficulties.includes(difficulty)) throw Error('Choose Easy, Normal or Hard.');
      let number = 1; while (lobby.players.some(p => p.name.toLowerCase() === `bot ${number}`)) number++;
      lobby.players.push({ id: `bot-${randomBytes(12).toString('hex')}`, name: `Bot ${number}`, color: COLORS.find(c => !lobby.players.some(p => p.color === c)), isBot: true, difficulty, connected: false, ready: true });
      resetReady(lobby); emitLobby(lobby); broadcastDirectory();
    });
    on('configureBot', payload => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId); waiting(lobby);
      const bot = lobby.players.find(p => p.id === payload.playerId && p.isBot);
      if (!bot) throw Error('Bot not found.');
      if (!difficulties.includes(payload.difficulty)) throw Error('Choose Easy, Normal or Hard.');
      bot.difficulty = payload.difficulty; resetReady(lobby); emitLobby(lobby);
    });
    on('configureLobby', payload => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId); waiting(lobby);
      const settings = validateSettings(payload.settings || {}, lobby.settings);
      if (settings.maxPlayers < lobby.players.length) throw Error('Player limit cannot be smaller than the current lobby.');
      lobby.settings = settings;
      if ('name' in payload) lobby.name = cleanText(payload.name, 48, lobby.name);
      if ('isPrivate' in payload) lobby.isPrivate = Boolean(payload.isPrivate);
      resetReady(lobby); emitLobby(lobby); broadcastDirectory();
    });
    on('setReady', payload => { const lobby = getLobby(playerId); waiting(lobby); lobby.players.find(p => p.id === playerId).ready = Boolean(payload.ready); emitLobby(lobby); });
    on('startGame', () => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId); waiting(lobby);
      if (lobby.players.length < 2) throw Error('At least two players are needed.');
      if (lobby.players.some(p => !p.isBot && (!p.connected || (p.id !== playerId && !p.ready)))) throw Error('Every player must be connected and ready.');
      const first = randomInt(lobby.players.length);
      const seating = [...lobby.players.slice(first), ...lobby.players.slice(0, first)];
      lobby.game = createGame(seating, lobby.settings); lobby.matchId = randomBytes(12).toString('hex'); lobby.botRevision = 0; lobby.status = 'playing'; emitLobby(lobby); broadcastDirectory();
    });
    on('gameAction', payload => {
      const lobby = getLobby(playerId); if (lobby.status !== 'playing') throw Error('There is no active match.');
      commitAction(lobby, playerId, payload);
    });
    on('botAction', payload => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId);
      const controller = botControllers.get(lobby.id);
      if (lobby.status !== 'playing' || !controller || controller.socketId !== socket.id || payload.lease !== controller.lease || payload.matchId !== lobby.matchId || payload.revision !== (lobby.botRevision || 0)) throw Error('Bot control or game state changed.');
      if (!lobby.players.some(p => p.id === payload.botId && p.isBot)) throw Error('Choose a bot in this lobby.');
      if (!payload.action || typeof payload.action !== 'object') throw Error('Invalid bot action.');
      commitAction(lobby, payload.botId, payload.action);
    });
    on('syncBots', () => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId); emitLobby(lobby);
    });
    on('chat', payload => {
      const lobby = getLobby(playerId); const text = cleanText(payload.text, 300); if (!text) return;
      const message = { id: randomBytes(6).toString('hex'), name: lobby.players.find(p => p.id === playerId).name, text, at: Date.now() };
      lobby.messages.push(message); lobby.messages = lobby.messages.slice(-80);
      for (const p of lobby.players) for (const id of sessions.get(p.id) || []) io.to(id).emit('chatMessage', message);
      emitLobby(lobby);
    });
    on('kickPlayer', payload => { const lobby = getLobby(playerId); requireHost(lobby, playerId); waiting(lobby); if (payload.playerId === playerId) throw Error('Use Leave lobby instead.'); if (!lobby.players.some(p => p.id === payload.playerId)) throw Error('Player not found.'); releasePlayer(lobby, payload.playerId, true); });
    on('transferHost', payload => { const lobby = getLobby(playerId); requireHost(lobby, playerId); const next = lobby.players.find(p => p.id === payload.playerId && !p.isBot && p.connected); if (!next) throw Error('Choose a connected human player.'); lobby.hostId = next.id; next.ready = true; emitLobby(lobby); broadcastDirectory(); });
    on('returnToLobby', () => { const lobby = getLobby(playerId); requireHost(lobby, playerId); if (lobby.status !== 'finished') throw Error('Finish the current match first.'); lobby.game = null; lobby.status = 'waiting'; resetReady(lobby); emitLobby(lobby); broadcastDirectory(); });
    on('abandonGame', () => {
      const lobby = getLobby(playerId); requireHost(lobby, playerId);
      if (lobby.status !== 'playing') throw Error('There is no active match to end.');
      lobby.game = null; lobby.status = 'waiting'; resetReady(lobby);
      lobby.messages.push({ id: randomBytes(6).toString('hex'), name: 'System', text: 'The host ended the match. You can configure a new game in the lobby.', at: Date.now() });
      lobby.messages = lobby.messages.slice(-80); emitLobby(lobby); broadcastDirectory();
    });
    socket.on('disconnect', () => {
      sessions.get(playerId)?.delete(socket.id);
      if (sessions.get(playerId)?.size) { const lobby = lobbies.get(memberships.get(playerId)); if (lobby) emitLobby(lobby); return; }
      sessions.delete(playerId);
      const lobby = lobbies.get(memberships.get(playerId)); if (!lobby) return;
      const p = lobby.players.find(p => p.id === playerId); p.connected = false; p.disconnectedAt = Date.now(); emitLobby(lobby); broadcastDirectory();
    });
  });
  let vite;
  if (!testMode) {
    if (production) { app.use(express.static(path.join(root, 'dist'))); app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html'))); }
    else { const { createServer } = await import('vite'); vite = await createServer({ root, server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' }); app.use(vite.middlewares); }
  }
  const timer = setInterval(() => {
    for (const lobby of lobbies.values()) {
      if (lobby.game && lobby.status === 'playing' && lobby.players.some(p => p.connected)) {
        try { const candidate = structuredClone(lobby.game); if (tick(candidate, Date.now(), lobby.players.filter(p => p.isBot).map(p => p.id))) { lobby.game = candidate; lobby.botRevision = (lobby.botRevision || 0) + 1; if (candidate.phase === 'finished') { lobby.status = 'finished'; broadcastDirectory(); } emitLobby(lobby); } }
        catch (error) { console.error('Timer resolution failed:', error.message); }
      }
      const currentHost = lobby.players.find(p => p.id === lobby.hostId);
      if (currentHost && !currentHost.connected && Date.now() - currentHost.disconnectedAt > 60000) {
        const next = lobby.players.find(p => !p.isBot && p.connected); if (next) { lobby.hostId = next.id; next.ready = true; emitLobby(lobby); broadcastDirectory(); }
      }
      if (Date.now() - lobby.updatedAt > 24 * 3600000 && !lobby.players.some(p => p.connected)) { for (const p of lobby.players) memberships.delete(p.id); lobbies.delete(lobby.id); botControllers.delete(lobby.id); dirty = true; }
    }
    save();
  }, testMode ? 50 : 1000);
  await new Promise(resolve => httpServer.listen(port, host, resolve));
  async function close() { clearInterval(timer); await save(); await vite?.close(); await new Promise(resolve => io.close(resolve)); if (httpServer.listening) await new Promise(resolve => httpServer.close(resolve)); }
  return { app, io, httpServer, lobbies, close, port: httpServer.address().port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createAppServer({ port: Number(process.env.PORT) || 3000, host: process.env.HOST || '0.0.0.0', production: process.argv.includes('--production') });
  console.log(`\n  CATAN TIDES · http://localhost:${server.port}\n  Standalone multiplayer server is ready.\n`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
}
