import React, { useId, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bot, Check, ChevronDown, CircleHelp, Compass, Copy,
  Crown, DoorOpen, Flag, Globe2, Home, LockKeyhole, Plus, ScrollText, Users, X,
} from "lucide-react";
import { DEFAULT_PLAYER_COUNT, lobbyPreset } from "../shared/lobby-presets.js";
import { Chat } from "./chat.jsx";
import "./lobby.css";

const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const TIMER_OPTIONS = [0, 30, 60, 90, 120, 180, 300, 600];
const BOARD_ROWS = [[3, 4, 5, 4, 3], [3, 4, 5, 6, 5, 4, 3]];
const BOARD_HEXES = BOARD_ROWS.map((rows) => rows.reduce((count, length) => count + length, 0));
const TERRAIN_PALETTE = ["#70834b", "#a48d51", "#546b4a", "#8e6045", "#667e7d", "#bc9c63"];
const DIFFICULTIES = { easy: "Easy", normal: "Normal", hard: "Hard" };

function Crest({ className = "" }) {
  return <img className={`front-crest ${className}`} src="/assets/lobby-crest.svg" alt="" width="60" height="68" />;
}

export function LobbyHeader({ connected, inLobby, leaving, onLeave, onHelp, soundControl }) {
  return (
    <header className="front-header">
      <div className="front-header-inner">
        <div className="front-brand">
          <Crest />
          <strong>LeCataNi</strong>
        </div>
        <div className="front-header-actions">
          <span className={`front-online ${connected ? "" : "offline"}`} role="status">
            <span className="front-status-light" aria-hidden="true" />
            <span className="front-online-label">{connected ? "Connected" : "Connecting"}</span>
          </span>
          {inLobby && (
            <button type="button" className="front-button quiet front-leave" onClick={onLeave} disabled={leaving} aria-label="Leave lobby" title="Leave lobby">
              <ArrowLeft size={15} aria-hidden="true" /> <span>Leave lobby</span>
            </button>
          )}
          {soundControl}
          <button type="button" className="front-button quiet front-guide" onClick={onHelp} aria-label="Game guide">
            <CircleHelp size={16} aria-hidden="true" /> <span>Game guide</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function FrameCorners() {
  return <span className="frame-corners" aria-hidden="true"><i /><i /><i /><i /></span>;
}

function LobbyBanner({ lobby, onInvite }) {
  const VisibilityIcon = lobby?.isPrivate ? LockKeyhole : Globe2;
  return (
    <section className={`front-banner ${lobby ? "room-banner" : ""}`}>
      <img src="/assets/island-hero.png" alt="" fetchPriority="high" />
      <div className="front-banner-content">
        {!lobby && <Crest className="banner-crest" />}
        <div className="front-banner-title">
          <h1>{lobby ? lobby.name : "Multiplayer"}</h1>
          {lobby && <p><VisibilityIcon size={15} aria-hidden="true" /> {lobby.isPrivate ? "Private lobby" : "Public lobby"}</p>}
        </div>
        {lobby && (
          <div className="front-invite">
            <span className="front-invite-code" aria-label={`Lobby code: ${lobby.id}`}>{lobby.id}</span>
            <button type="button" className="front-button" onClick={onInvite}>
              <Copy size={15} aria-hidden="true" /> Copy invite link
            </button>
          </div>
        )}
      </div>
      <FrameCorners />
    </section>
  );
}

function PanelHeading({ icon: Icon, title, id, count, children }) {
  return (
    <div className="front-panel-heading">
      <span className="front-panel-icon"><Icon size={17} strokeWidth={1.55} aria-hidden="true" /></span>
      <h2 id={id}>{title}</h2>
      {count != null && <span className="front-count">{count}</span>}
      {children && <div className="front-panel-tools">{children}</div>}
    </div>
  );
}

function BoardThumbnail({ expanded = false }) {
  const rows = BOARD_ROWS[Number(expanded)];
  const radius = 9.4;
  const hex = "0,-9.4 8.14,-4.7 8.14,4.7 0,9.4 -8.14,4.7 -8.14,-4.7";
  return (
    <svg className="board-thumbnail" viewBox="0 0 164 112" aria-hidden="true" focusable="false">
      <g className="board-chart" fill="none">
        <path d="M0 16h164M0 40h164M0 64h164M0 88h164M10 0v112M34 0v112M58 0v112M82 0v112M106 0v112M130 0v112M154 0v112" />
        <path d="M9 79c18 10 43 18 68 14 24-4 43-29 77-19" strokeDasharray="2 4" className="board-chart-route" />
        <circle cx="21" cy="25" r="9" className="board-chart-route" />
        <path d="m21 13 2.2 9.8L33 25l-9.8 2.2L21 37l-2.2-9.8L9 25l9.8-2.2z" className="board-chart-compass" />
      </g>
      <g className="board-thumb-land">
        {rows.flatMap((length, row) =>
          Array.from({ length }, (_, col) => {
            const x = 82 + (col - (length - 1) / 2) * Math.sqrt(3) * radius;
            const y = 56 + (row - (rows.length - 1) / 2) * 1.5 * radius;
            return (
              <g key={`${row}-${col}`} transform={`translate(${x} ${y})`}>
                <polygon points={hex} fill={TERRAIN_PALETTE[(row * 3 + col * 2 + Math.floor(col / 2)) % 6]} />
                <path d="m-6 3 6 4 6-4" fill="none" stroke="#172321" strokeOpacity=".38" strokeWidth=".8" />
              </g>
            );
          }),
        )}
      </g>
    </svg>
  );
}

function BoardPicker({ expanded, onChange, disabled }) {
  const group = useId();
  return (
    <fieldset className="board-picker" disabled={disabled}>
      <legend>Board</legend>
      <div className="board-options">
        {[false, true].map((option, index) => (
          <label className="board-choice" key={index}>
            <input type="radio" name={group} checked={expanded === option} onChange={() => onChange(option)} />
            <span className="board-choice-face">
              <BoardThumbnail expanded={option} />
              <span className="board-choice-caption">
                <span><strong>{option ? "Expanded" : "Classic"}</strong><small>{BOARD_HEXES[index]} hexes</small></span>
                <span className="board-choice-check" aria-hidden="true"><Check size={13} /></span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ checked, onChange, label, description, disabled = false }) {
  const descriptionId = useId();
  return (
    <label className="front-toggle">
      <span>
        <strong>{label}</strong>
        {description && <small id={descriptionId}>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
      />
      <span className="front-switch" aria-hidden="true"><Check size={13} /></span>
    </label>
  );
}

function canJoin(room) {
  return room.status === "waiting" && room.playerCount < room.maxPlayers;
}

function LobbyDirectory({ directory, onJoin, connected, busy }) {
  const [filter, setFilter] = useState("all");
  const rooms = filter === "all" ? directory : directory.filter(canJoin);
  return (
    <section className="front-panel directory-panel" aria-labelledby="public-lobbies-title">
      <PanelHeading icon={Globe2} title="Public lobbies" id="public-lobbies-title" count={rooms.length}>
        <div className="front-segment directory-filter" role="group" aria-label="Lobby filter">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button type="button" aria-pressed={filter === "joinable"} onClick={() => setFilter("joinable")}>Joinable</button>
        </div>
      </PanelHeading>
      <div className="directory-well">
        <table className="directory-table" aria-labelledby="public-lobbies-title">
          <thead>
            <tr><th scope="col">Lobby</th><th scope="col">Players</th><th scope="col" className="directory-board">Board</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <th scope="row" className="directory-room">
                  <strong>{room.name}</strong>
                  <small>{room.hostName}<span className="directory-mobile-board"> · {room.settings?.extendedBoard ? "Expanded" : "Classic"}</span></small>
                </th>
                <td>
                  <span className="directory-seats">
                    <span className="directory-pips" aria-hidden="true">
                      {Array.from({ length: room.maxPlayers }, (_, i) => <i key={i} className={i < room.playerCount ? "filled" : ""} />)}
                    </span>
                    <span aria-label={`${room.playerCount} of ${room.maxPlayers} players`}>{room.playerCount}/{room.maxPlayers}</span>
                  </span>
                </td>
                <td className="directory-board">{room.settings?.extendedBoard ? "Expanded" : "Classic"}</td>
                <td className="directory-status">
                  {canJoin(room) ? (
                    <button type="button" className="front-button directory-join" aria-label={`Join ${room.name}`} disabled={!connected || !!busy} onClick={() => onJoin(room.id)}>
                      Join <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  ) : <span>{room.status === "waiting" ? "Full" : room.status === "finished" ? "Finished" : "In progress"}</span>}
                </td>
              </tr>
            ))}
            {!rooms.length && (
              <tr>
                <td colSpan={4} className="directory-empty">
                  <Compass size={56} strokeWidth={0.75} aria-hidden="true" />
                  <p>{filter === "all" ? "No public lobbies" : "No joinable lobbies"}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <FrameCorners />
    </section>
  );
}

export function HomeScreen({ name, setName, directory, command, busy, connected }) {
  const invite = new URLSearchParams(location.search).get("lobby") || "";
  const [tab, setTab] = useState(invite ? "join" : "create");
  const [title, setTitle] = useState("");
  const [privateLobby, setPrivateLobby] = useState(false);
  const [players, setPlayers] = useState(DEFAULT_PLAYER_COUNT);
  const [code, setCode] = useState(invite.toUpperCase());
  const displayName = useRef(null);
  const preset = lobbyPreset(players);
  const playerName = name.trim();
  const joinRoom = (id) => {
    setTab("join");
    setCode(id);
    if (!playerName) displayName.current?.focus();
    else command("joinLobby", { id, playerName });
  };
  const submit = (event) => {
    event.preventDefault();
    if (!playerName) {
      displayName.current?.focus();
      return;
    }
    if (tab === "create") {
      command("createLobby", {
        name: title.trim() || `${playerName}’s lobby`,
        playerName,
        isPrivate: privateLobby,
        settings: preset,
      });
    } else {
      command("joinLobby", { id: code.trim().toUpperCase(), playerName });
    }
  };
  return (
    <main className="front-page">
      <LobbyBanner />
      <div className="browser-layout">
        <section className="front-panel play-panel" aria-labelledby="play-title">
          <PanelHeading icon={Flag} title="Play" id="play-title" />
          <form onSubmit={submit} className="play-form">
            <label className="front-field">
              Display name
              <input ref={displayName} value={name} onChange={(event) => setName(event.target.value)} maxLength={24} required autoComplete="nickname" />
            </label>
            <div className="front-segment play-tabs" role="group" aria-label="Play mode">
              <button type="button" aria-pressed={tab === "create"} onClick={() => setTab("create")}><Plus size={15} aria-hidden="true" /> Create</button>
              <button type="button" aria-pressed={tab === "join"} onClick={() => setTab("join")}><DoorOpen size={15} aria-hidden="true" /> Join by code</button>
            </div>
            {tab === "create" ? (
              <>
                <label className="front-field">
                  Lobby name
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" maxLength={48} />
                </label>
                <fieldset className="player-count">
                  <legend>Player limit</legend>
                  <div className="front-segment">
                    {PLAYER_COUNTS.map((count) => (
                      <button type="button" key={count} aria-pressed={players === count} onClick={() => setPlayers(count)}>{count}</button>
                    ))}
                  </div>
                </fieldset>
                <dl className="play-preset" aria-label="Game settings" aria-live="polite" aria-atomic="true">
                  <div className="play-preset-board">
                    <dt>Board</dt>
                    <dd>
                      {preset.extendedBoard ? "Expanded" : "Classic"}
                      <BoardThumbnail expanded={preset.extendedBoard} />
                    </dd>
                  </div>
                  <div><dt>Points to win</dt><dd>{preset.victoryPoints}</dd></div>
                  <div><dt>Discard threshold</dt><dd>{preset.discardThreshold} cards</dd></div>
                  <div><dt>Friendly robber</dt><dd>{preset.friendlyRobber ? "On" : "Off"}</dd></div>
                </dl>
                <Toggle checked={privateLobby} onChange={setPrivateLobby} label="Private lobby" />
              </>
            ) : (
              <label className="front-field">
                Invite code
                <input className="front-code-input" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} required autoCapitalize="characters" spellCheck={false} />
              </label>
            )}
            <button type="submit" className="front-button primary play-submit" disabled={!connected || !!busy}>
              {tab === "create" ? <Plus size={18} aria-hidden="true" /> : <DoorOpen size={18} aria-hidden="true" />}
              {tab === "create" ? "Create lobby" : "Join lobby"}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </form>
          <FrameCorners />
        </section>
        <LobbyDirectory directory={directory} onJoin={joinRoom} connected={connected} busy={busy} />
      </div>
    </main>
  );
}

function SettingsSelect({ label, value, options, format = String, disabled, onChange, help }) {
  const helpId = useId();
  return (
    <div>
      <label className="front-field">
        {label}
        <select value={value} disabled={disabled} aria-describedby={help ? helpId : undefined} onChange={(event) => onChange(Number(event.target.value))}>
          {options.map((number) => <option key={number} value={number}>{format(number)}</option>)}
        </select>
      </label>
      {help && <p className="front-field-help" id={helpId}>{help}</p>}
    </div>
  );
}

function SettingsPanel({ lobby, host, busy, command }) {
  const settings = lobby.settings;
  const disabled = !host || !!busy;
  const change = (key, value) => command("configureLobby", {
    settings: {
      [key]: value,
      ...(key === "maxPlayers" ? { extendedBoard: value >= 5 } : {}),
    },
  });
  return (
    <section className="front-panel lobby-settings" aria-labelledby="game-settings-title">
      <PanelHeading icon={ScrollText} title="Game settings" id="game-settings-title">
        {!host && <span className="settings-readonly" title="Only the host can edit"><LockKeyhole size={14} aria-hidden="true" /> Host only</span>}
      </PanelHeading>
      <div className="lobby-settings-body">
        {host && (
          <div className="settings-meta">
            <label className="front-field">
              Lobby name
              <input
                key={lobby.name}
                defaultValue={lobby.name}
                maxLength={48}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = lobby.name;
                    event.currentTarget.blur();
                  }
                }}
                onBlur={(event) => {
                  const nextName = event.target.value.trim();
                  if (!nextName) event.target.value = lobby.name;
                  else if (nextName !== lobby.name) command("configureLobby", { name: nextName });
                }}
              />
            </label>
            <Toggle label="Private lobby" checked={lobby.isPrivate} disabled={!!busy} onChange={(isPrivate) => command("configureLobby", { isPrivate })} />
          </div>
        )}
        <BoardPicker expanded={settings.extendedBoard} onChange={(value) => change("extendedBoard", value)} disabled={disabled} />
        <Toggle checked={settings.lockDesertToCenter} onChange={(value) => change("lockDesertToCenter", value)} label="Lock desert to center" disabled={disabled} />
        <div className="lobby-settings-grid">
          <SettingsSelect label="Player limit" value={settings.maxPlayers} options={PLAYER_COUNTS.filter((count) => count >= lobby.players.length)} disabled={disabled} onChange={(value) => change("maxPlayers", value)} />
          <SettingsSelect label="Points to win" value={settings.victoryPoints} options={Array.from({ length: 18 }, (_, i) => i + 3)} disabled={disabled} onChange={(value) => change("victoryPoints", value)} />
          <SettingsSelect label="Turn timer" value={settings.turnSeconds} options={TIMER_OPTIONS}
            format={(seconds) => seconds === 0 ? "Off" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
            disabled={disabled} onChange={(value) => change("turnSeconds", value)} />
          <SettingsSelect label="Discard threshold" value={settings.discardThreshold} options={Array.from({ length: 28 }, (_, i) => i + 3)} disabled={disabled} onChange={(value) => change("discardThreshold", value)} />
        </div>
        <details className="front-advanced">
          <summary>Advanced settings <ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="front-advanced-body">
            <Toggle checked={settings.friendlyRobber} onChange={(value) => change("friendlyRobber", value)} label="Friendly robber" description="Protect players with fewer than 3 visible points." disabled={disabled} />
            <Toggle checked={settings.balancedNumbers} onChange={(value) => change("balancedNumbers", value)} label="Balanced numbers" description="Prevent adjacent 6 and 8 tokens." disabled={disabled} />
            <Toggle checked={settings.unlimitedDevelopmentCards} onChange={(value) => change("unlimitedDevelopmentCards", value)} label="Unlimited Dev Cards in Bank" description="Shuffle a fresh deck when the bank runs out." disabled={disabled} />
            <Toggle checked={settings.unlimitedResourceCards} onChange={(value) => change("unlimitedResourceCards", value)} label="Unlimited resource Cards in Bank" disabled={disabled} />
            <Toggle checked={settings.allowPlayerTrading} onChange={(value) => change("allowPlayerTrading", value)} label="Player trading" disabled={disabled} />
            <Toggle checked={settings.pairedTurns} onChange={(value) => change("pairedTurns", value)} label="Paired turns for 5–6 players" description="A second player gets an action phase after each turn." disabled={disabled} />
            <div className="lobby-settings-grid">
              <SettingsSelect label="Hard hand limit" value={settings.hardHandLimit} options={[0, 10, 15, 20, 25, 30, 40, 50]}
                format={(value) => value === 0 ? "Off" : String(value)} help="Excess resource cards automatically return to the bank."
                disabled={disabled} onChange={(value) => change("hardHandLimit", value)} />
              <label className="front-field">
                Board seed
                <input key={settings.seed} disabled={disabled} defaultValue={settings.seed || ""} onBlur={(event) => {
                  if (event.target.value !== settings.seed) change("seed", event.target.value);
                }} placeholder="Random" maxLength={40} />
              </label>
            </div>
          </div>
        </details>
      </div>
      <FrameCorners />
    </section>
  );
}

function RosterSlot({ player, index, meId, hostId, host, busy, command }) {
  const isHost = player?.id === hostId;
  const isMe = player?.id === meId;
  const difficulty = player?.isBot ? DIFFICULTIES[player.difficulty] : "";
  return (
    <li className={`roster-slot ${player ? "" : "empty"}`}>
      <span className="roster-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className="roster-banner" style={player ? { "--player": player.color } : undefined} aria-hidden="true">
        {player?.isBot ? <Bot size={16} /> : <Home size={16} />}
      </span>
      {player ? (
        <>
          <span className="roster-name"><strong>{player.name}</strong>{isMe && <small> (you)</small>}</span>
          <span className={`roster-state ${isHost ? "is-host" : !player.isBot && player.ready && player.connected ? "is-ready" : ""}`}>
            {isHost ? <><Crown size={14} aria-hidden="true" /> {player.connected ? "Host" : "Host offline"}</>
              : player.isBot ? (host ? "Bot" : `Bot · ${difficulty}`)
                : !player.connected ? "Offline"
                  : player.ready ? <><Check size={14} aria-hidden="true" /> Ready</> : "Not ready"}
          </span>
          {host && !isMe && (
            <div className="roster-tools">
              {player.isBot ? (
                <select aria-label={`Difficulty for ${player.name}`} value={player.difficulty} disabled={!!busy} onChange={(event) => command("configureBot", { playerId: player.id, difficulty: event.target.value })}>
                  {Object.entries(DIFFICULTIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : (
                <button type="button" className="front-button icon" title={`Make ${player.name} host`} aria-label={`Make ${player.name} host`} disabled={!!busy} onClick={() => command("transferHost", { playerId: player.id })}>
                  <Crown size={15} aria-hidden="true" />
                </button>
              )}
              <button type="button" className="front-button icon" title={`Remove ${player.name}`} aria-label={`Remove ${player.name}`} disabled={!!busy} onClick={() => command("kickPlayer", { playerId: player.id })}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      ) : <span className="roster-name">Open slot</span>}
    </li>
  );
}

export function WaitingRoom({ lobby, meId, botSupport, command, copyInvite, busy }) {
  const host = meId === lobby.hostId;
  const hasBotSlot = host && lobby.players.length < lobby.settings.maxPlayers;
  const me = lobby.players.find((player) => player.id === meId);
  const allReady = lobby.players.filter((player) => player.id !== lobby.hostId).every((player) => player.isBot || (player.ready && player.connected));
  const blocked = lobby.players.length < 2 ? "At least 2 players are required." : !allReady ? "Waiting for players to be ready." : "";
  return (
    <main className="front-page waiting-screen">
      <LobbyBanner lobby={lobby} onInvite={copyInvite} />
      <div className="waiting-grid">
        <section className="front-panel roster-panel" aria-labelledby="roster-title">
          <PanelHeading icon={Users} title="Players" id="roster-title" count={`${lobby.players.length}/${lobby.settings.maxPlayers}`}>
            {hasBotSlot && (
              <button type="button" className="front-button add-bot-action" disabled={!!busy || botSupport !== true} onClick={() => command("addBot", { difficulty: "normal" })}>
                <Bot size={16} aria-hidden="true" /> Add bot
              </button>
            )}
          </PanelHeading>
          <ol className="roster-list" aria-label="Player slots">
            {Array.from({ length: lobby.settings.maxPlayers }, (_, index) => (
              <RosterSlot key={lobby.players[index]?.id || index} player={lobby.players[index]} index={index} meId={meId} hostId={lobby.hostId} host={host} busy={busy} command={command} />
            ))}
          </ol>
          {hasBotSlot && botSupport === false && <p className="roster-note" role="status">The game server needs an update to add bots.</p>}
          {lobby.players.some((player) => player.isBot) && <p className="roster-note">Bots run in the host’s browser. Keep it open during the game.</p>}
          <div className="roster-command">
            {host ? (
              <>
                {blocked && <p>{blocked}</p>}
                <button type="button" className="front-button primary" disabled={!!blocked || !!busy} onClick={() => command("startGame")}>
                  <Flag size={17} aria-hidden="true" /> Start game <ArrowRight size={16} aria-hidden="true" />
                </button>
              </>
            ) : (
              <button type="button" className={`front-button ${me?.ready ? "" : "primary"}`} disabled={!!busy} onClick={() => command("setReady", { ready: !me?.ready })}>
                <Check size={17} aria-hidden="true" /> {me?.ready ? "Cancel ready" : "Ready"}
              </button>
            )}
          </div>
          <FrameCorners />
        </section>
        <SettingsPanel lobby={lobby} host={host} busy={busy} command={command} />
        <Chat lobby={lobby} command={command} />
      </div>
    </main>
  );
}
