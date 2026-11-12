import React, { useState, useEffect, useId, useLayoutEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { attachBotController } from "./bots/controller.js";
import { openTradeOffers, playerTradesAvailable } from "../shared/trades.js";
import { ResourceCardDraft, ResourceOfferCards } from "./resource-card-draft.jsx";
import {
  Anchor,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  DoorOpen,
  Flag,
  Globe2,
  Hammer,
  HelpCircle,
  LockKeyhole,
  Map,
  MessageSquare,
  Mountain,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Shield,
  Shuffle,
  Sparkles,
  Sprout,
  Swords,
  Trees,
  Users,
  Waves,
  Wheat,
  X,
  Volume2,
  Compass,
  Dices,
  CircleHelp,
  LogOut,
  Handshake,
  Package,
  Route,
  Home,
  Building2,
  Trophy,
  Bot,
} from "lucide-react";
import { Sheep } from "./sheep-icon.js";
import { resourceName } from "../shared/resource-names.js";
import { gameLogText } from "./game-log-text.js";
import "./styles.css";
import "./match-framing.css";
import { CardDealLayer, PlayerHandBacks, useCardDeals } from "./card-deals.jsx";
import { useRollReminder } from "./roll-reminder.js";
import { MatchResults } from "./match-results.jsx";
import { KeyboardShortcuts, MatchShortcuts, shortcutProps } from "./match-shortcuts.jsx";
import { DevelopmentTray, RobberTray, TableDialog, TableFeedback, developmentRestriction } from "./match-prompts.jsx";
import { CityUpgradePreview } from "./build-preview.jsx";
import { FriendlyRobberHint, RobberHexMark } from "./robber-guide.jsx";
import { robberPlacement, ROBBER_TILE_HINTS } from "./robber-placements.js";
import { SoundToggle, useDecisionWarning, useSoundEffects } from "./sound.jsx";
import { lobbySoundCues } from "./sound-cues.js";

const RES = ["wood", "brick", "wool", "wheat", "ore"];
const META = {
  wood: { name: "Wood", icon: Trees, color: "#42714d", tile: 0 },
  wheat: { name: "Wheat", icon: Wheat, color: "#ba9140", tile: 1 },
  wool: { name: resourceName("wool"), icon: Sheep, color: "#8b9b59", tile: 2 },
  brick: { name: "Brick", icon: Package, color: "#b46c48", tile: 3 },
  ore: { name: "Ore", icon: Mountain, color: "#727d87", tile: 4 },
  desert: { name: "Desert", icon: Compass, color: "#c7ad75", tile: 5 },
};
const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  development: { wool: 1, wheat: 1, ore: 1 },
};
const DEFAULTS = {
  maxPlayers: 4,
  extendedBoard: false,
  victoryPoints: 10,
  discardThreshold: 7,
  hardHandLimit: 0,
  turnSeconds: 120,
  friendlyRobber: false,
  balancedNumbers: true,
  allowPlayerTrading: true,
  pairedTurns: true,
  seed: "",
};
function getToken() {
  let token = localStorage.getItem("catanToken");
  if (!token) {
    token =
      globalThis.crypto?.randomUUID?.() ||
      Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
    localStorage.setItem("catanToken", token);
  }
  return token;
}
function ResourceIcon({ resource, size = 16, ...rest }) {
  const Icon = META[resource]?.icon || Package;
  return <Icon size={size} {...rest} />;
}
function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-mark">
        <Compass size={30} strokeWidth={1.3} />
      </span>
      <span>
        <strong>LeCataNi</strong>
      </span>
    </div>
  );
}
function Button({ children, variant = "", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch" />
    </label>
  );
}
function Cost({ cost }) {
  return (
    <span className="cost">
      {Object.entries(cost).map(([r, n]) => (
        <span
          key={r}
          title={`${n} ${META[r].name}`}
          style={{ color: META[r].color }}
        >
          <ResourceIcon resource={r} size={13} />
          {n > 1 && n}
        </span>
      ))}
    </span>
  );
}
function AtlasArt({ terrain, className = "" }) {
  return (
    <div
      className={`atlas-art ${className}`}
      style={{
        backgroundColor: META[terrain]?.color,
        backgroundPosition: `${(META[terrain]?.tile % 3) * 50}% ${META[terrain]?.tile >= 3 ? 100 : 0}%`,
      }}
    />
  );
}
function App() {
  const [socket, setSocket] = useState(null),
    [connected, setConnected] = useState(false),
    [meId, setMeId] = useState(null),
    [directory, setDirectory] = useState([]),
    [lobby, setLobby] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false),
    [abandon, setAbandon] = useState(false),
    [busy, setBusy] = useState("");
  const [name, setName] = useState(localStorage.getItem("catanName") || "");
  const { enabled: soundEnabled, toggle: toggleSound, player: sound } = useSoundEffects();
  useDecisionWarning(connected ? lobby?.game : null, lobby?.meId, sound);
  const cardDealStream = useRef(0);
  const inMatch = !!lobby?.game;
  const canAbandon = inMatch && lobby.status === "playing" && lobby.game.phase !== "finished" && lobby.hostId === (meId || lobby.meId);
  useEffect(() => { if (!canAbandon) setAbandon(false); }, [canAbandon]);
  useEffect(() => {
    const s = io({ auth: { token: getToken() } });
    let stopBots;
    let lastLobby = null;
    try { stopBots = attachBotController(s, setError); }
    catch { setError("Local bots require Web Workers. Try reloading in a current browser."); }
    setSocket(s);
    s.on("connect", () => {
      cardDealStream.current++;
      setConnected(true);
      s.emit("getDirectory", {});
    });
    s.on("disconnect", () => {
      lastLobby = null;
      sound.stop();
      setConnected(false);
    });
    s.on("connect_error", () => setConnected(false));
    s.on("session", (x) => setMeId(x.playerId));
    s.on("directory", setDirectory);
    s.on("lobby", (l) => {
      const cues = lobbySoundCues(lastLobby, l);
      lastLobby = l;
      setLobby(l && { ...l, cardDealStream: cardDealStream.current });
      if (l?.meId) setMeId(l.meId);
      if (l) history.replaceState({}, "", `?lobby=${l.id}`);
      sound.play(...cues);
    });
    s.on("chatMessage", (message) => {
      if (lastLobby) sound.play("chat");
      setLobby((l) =>
        l
          ? {
              ...l,
              messages: [
                ...(l.messages || []).filter((m) => m.id !== message.id),
                message,
              ].slice(-100),
            }
          : l,
      );
    });
    s.on("errorMessage", (x) =>
      setError(typeof x === "string" ? x : x.error || "Something went wrong."),
    );
    return () => { stopBots?.(); s.disconnect(); };
  }, [sound]);
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const command = (event, payload = {}) =>
    new Promise((resolve) => {
      if (!socket?.connected) return resolve(false);
      if (event === "gameAction" && payload.type === "declineTrade" && !Array.isArray(lobby?.game?.tradeOffers)) {
        setError("Restart the game server and reload this page to decline trade offers.");
        return resolve(false);
      }
      setBusy(event);
      socket.timeout(10000).emit(event, payload, (err, result) => {
        setBusy("");
        if (err || !result?.ok) {
          setError(
            err
              ? "The server did not respond. Please try again."
              : result?.error || "That action could not be completed.",
          );
          return resolve(false);
        }
        if (event === "createLobby" || event === "joinLobby") sound.play("join");
        if (event === "setReady" && !payload.ready) sound.play("confirm");
        resolve(result);
      });
    });
  const rememberName = (value) => {
    setName(value);
    localStorage.setItem("catanName", value);
  };
  const leave = async () => {
    if (await command("leaveLobby")) {
      setLobby(null);
      history.replaceState({}, "", "/");
    }
  };
  const copyInvite = async () => {
    const link = `${location.origin}/?lobby=${lobby.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Invite link copied.");
      sound.play("confirm");
    } catch {
      setNotice(`Lobby code: ${lobby.id}`);
    }
  };
  const showAbandon = abandon && canAbandon;
  const feedback = <TableFeedback disconnected={inMatch && !connected}
    botsPaused={connected && lobby?.status === "playing" && lobby.botsPaused} error={error} notice={notice}
    onDismiss={() => { setError(""); setNotice(""); }} />;
  return (
    <>
      <header className={`site-header ${lobby?.game ? "in-game" : ""}`}>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            if (!lobby) history.replaceState({}, "", "/");
          }}
          aria-label="LeCataNi home"
        >
          <Brand compact={!!lobby?.game} />
        </a>
        <nav>
          {lobby ? (
            <>
              <span className="header-table">
                <span className="status-dot" />
                {lobby.name}
                <span className="lobby-code">{lobby.id}</span>
              </span>
              <button onClick={copyInvite}>
                <Copy size={15} /> Copy invite link
              </button>
            </>
          ) : (
            <>
              <span className="nav-active">Play online</span>
              <button onClick={() => setHelp(true)}>How to play</button>
            </>
          )}
        </nav>
        <div className="header-end">
          <span className={`connection ${connected ? "" : "offline"}`} role="status">
            <span />
            {connected ? "Connected" : "Connecting"}
          </span>
          {lobby ? (
            <button className="icon-button" title="Leave lobby" onClick={leave}>
              <LogOut size={18} />
            </button>
          ) : (
            <span className="no-account">No account needed</span>
          )}
          <button
            className="icon-button"
            aria-label="Game guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <SoundToggle enabled={soundEnabled} onToggle={toggleSound} className="icon-button header-sound" />
        </div>
      </header>
      {lobby ? (
        lobby.game ? (
          <Game
            lobby={lobby}
            meId={meId || lobby.meId}
            command={command}
            busy={busy}
            onHelp={() => setHelp(true)}
            onAbandon={canAbandon ? () => setAbandon(true) : undefined}
            onCopyInvite={copyInvite}
            onLeave={leave}
          />
        ) : (
          <WaitingRoom
            lobby={lobby}
            meId={meId || lobby.meId}
            command={command}
            copyInvite={copyInvite}
            busy={busy}
          />
        )
      ) : (
        <HomeScreen
          name={name}
          setName={rememberName}
          directory={directory}
          command={command}
          busy={busy}
          connected={connected}
        />
      )}
      {!help && !showAbandon && <div className="table-feedback-layer">{feedback}</div>}
      {help && <Guide onClose={() => setHelp(false)} feedback={feedback} />}
      {showAbandon && (
        <TableDialog title="End match?" icon={LogOut} onClose={() => setAbandon(false)} feedback={feedback}
          description="Everyone returns to the lobby and this match’s progress is lost.">
          <div className="table-confirm-actions">
            <button type="button" className="draft-command match-command" onClick={() => setAbandon(false)}>Keep playing</button>
            <button type="button" className="draft-command match-command" data-tone="reject" disabled={!!busy}
              onClick={async () => { if (await command("abandonGame")) setAbandon(false); }}>End match</button>
          </div>
        </TableDialog>
      )}
    </>
  );
}

function HomeScreen({ name, setName, directory, command, busy, connected }) {
  const [tab, setTab] = useState("create"),
    [title, setTitle] = useState(""),
    [privateLobby, setPrivateLobby] = useState(false),
    [players, setPlayers] = useState(4),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("lobby") || "",
    ),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("lobby")) setTab("join");
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (tab === "create")
      await command("createLobby", {
        name: title.trim() || `${name.trim()}'s lobby`,
        playerName: name.trim(),
        isPrivate: privateLobby,
        settings: { maxPlayers: players, extendedBoard: players >= 5 },
      });
    else
      await command("joinLobby", {
        id: code.trim().toUpperCase(),
        playerName: name.trim(),
      });
  };
  const rooms = directory.filter(
    (l) => filter === "all" || l.status === "waiting",
  );
  return (
    <main className="home-page">
      <section className="intro-line">
        <div>
          <h1>LeCataNi</h1>
          <p>Online game for 2–6 players.</p>
        </div>
      </section>
      <div className="home-layout">
        <div className="home-main">
          <section className="island-hero">
            <img
              src="/assets/island-hero.png"
              alt="Painterly island with evergreen forests, golden fields and a coastal settlement"
            />
            <div className="hero-shade" />
            <div className="hero-top">
              <span className="hero-tag">2–6 PLAYERS</span>
            </div>
          </section>
          <section className="tables-section">
            <div className="section-title">
              <div>
                <h2>
                  Public lobbies <span>{directory.length}</span>
                </h2>
              </div>
              <div className="segmented small">
                <button
                  className={filter === "all" ? "selected" : ""}
                  onClick={() => setFilter("all")}
                >
                  All
                </button>
                <button
                  className={filter === "waiting" ? "selected" : ""}
                  onClick={() => setFilter("waiting")}
                >
                  Waiting
                </button>
              </div>
            </div>
            <div className="table-list">
              {rooms.length ? (
                rooms.map((room) => (
                  <button
                    className="public-table"
                    key={room.id}
                    disabled={
                      room.status !== "waiting" ||
                      room.playerCount >= room.maxPlayers
                    }
                    onClick={() => {
                      setTab("join");
                      setCode(room.id);
                    }}
                  >
                    <div className="table-illustration">
                      <Map size={23} strokeWidth={1.2} />
                    </div>
                    <div className="table-info">
                      <strong>{room.name}</strong>
                      <span>
                        Hosted by {room.hostName} <b>·</b>{" "}
                        {room.settings?.extendedBoard
                          ? "Expanded board"
                          : "Classic board"}
                      </span>
                    </div>
                    <span className="table-players">
                      <Users size={15} />
                      {room.playerCount}/{room.maxPlayers}
                    </span>
                    <span
                      className={`table-status ${room.status === "waiting" ? "waiting" : ""}`}
                    >
                      {room.status === "waiting"
                        ? room.playerCount >= room.maxPlayers
                          ? "Full"
                          : "Join lobby"
                        : "In progress"}
                      <ArrowRight size={15} />
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-tables">
                  <div>
                    <Anchor size={27} strokeWidth={1.2} />
                  </div>
                  <strong>No public lobbies.</strong>
                  <p>Create a lobby to start a game.</p>
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="join-card">
          <div className="join-card-heading">
            <h2>Play</h2>
          </div>
          <form onSubmit={submit}>
            <label className="field-label">
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                maxLength={24}
                required
                autoComplete="nickname"
              />
            </label>
            <div className="segmented">
              <button
                type="button"
                className={tab === "create" ? "selected" : ""}
                onClick={() => setTab("create")}
              >
                <Plus size={15} />
                Create lobby
              </button>
              <button
                type="button"
                className={tab === "join" ? "selected" : ""}
                onClick={() => setTab("join")}
              >
                <DoorOpen size={15} />
                Join lobby
              </button>
            </div>
            {tab === "create" ? (
              <>
                <label className="field-label">
                  Lobby name <span>OPTIONAL</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Lobby name"
                    maxLength={48}
                  />
                </label>
                <div className="field-label">
                  Players
                  <div className="seat-selector">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <button
                        type="button"
                        className={players === n ? "selected" : ""}
                        key={n}
                        onClick={() => setPlayers(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <Toggle
                  checked={privateLobby}
                  onChange={setPrivateLobby}
                  label="Private lobby"
                  description="Only players with the invite code can join."
                />
                <div className="setup-note">
                  <Map size={17} />
                  <span>
                    {players >= 5
                      ? "Expanded board selected."
                      : "Classic board selected."}{" "}
                    Settings can be changed in the lobby.
                  </span>
                </div>
                <Button className="full" disabled={!connected || !!busy}>
                  <Plus size={18} />
                  Create lobby
                  <ArrowRight size={17} />
                </Button>
              </>
            ) : (
              <>
                <label className="field-label">
                  Invite code
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABCDEF"
                    maxLength={12}
                    required
                  />
                </label>
                <div className="setup-note">
                  <LockKeyhole size={17} />
                  <span>Enter an invite code or select a public lobby.</span>
                </div>
                <Button className="full" disabled={!connected || !!busy}>
                  <DoorOpen size={18} />
                  Join lobby
                  <ArrowRight size={17} />
                </Button>
              </>
            )}
          </form>
        </aside>
      </div>
    </main>
  );
}

function SettingsSelect({
  label,
  value,
  options,
  format = String,
  disabled,
  onChange,
  help,
}) {
  const helpId = useId();
  return (
    <div>
      <label className="field-label">
        {label}
        <select
          value={value}
          disabled={disabled}
          aria-describedby={help ? helpId : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {format(n)}
            </option>
          ))}
        </select>
      </label>
      {help && (
        <p className="settings-help" id={helpId}>
          {help}
        </p>
      )}
    </div>
  );
}

function SettingsForm({ settings, onChange, disabled }) {
  const s = { ...DEFAULTS, ...settings };
  const change = (key, value) =>
    onChange({
      ...s,
      [key]: value,
      ...(key === "maxPlayers" ? { extendedBoard: value >= 5 } : {}),
    });
  return (
    <div className="settings-form">
      <div className="settings-grid">
        <SettingsSelect
          label="Player limit"
          value={s.maxPlayers}
          options={[2, 3, 4, 5, 6]}
          disabled={disabled}
          onChange={(n) => change("maxPlayers", n)}
        />
        <SettingsSelect
          label="Points to win"
          value={s.victoryPoints}
          options={Array.from({ length: 18 }, (_, i) => i + 3)}
          disabled={disabled}
          onChange={(n) => change("victoryPoints", n)}
        />
        <SettingsSelect
          label="Turn timer"
          value={s.turnSeconds}
          options={[0, 30, 60, 90, 120, 180, 300, 600]}
          format={(seconds) =>
            seconds === 0
              ? "Off"
              : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          }
          disabled={disabled}
          onChange={(n) => change("turnSeconds", n)}
        />
        <SettingsSelect
          label="Discard threshold"
          value={s.discardThreshold}
          options={Array.from({ length: 28 }, (_, i) => i + 3)}
          disabled={disabled}
          onChange={(n) => change("discardThreshold", n)}
        />
      </div>
      <Toggle
        checked={s.extendedBoard}
        onChange={(v) => change("extendedBoard", v)}
        label="Expanded board"
        description="30 hexes instead of 19."
        disabled={disabled}
      />
      <details className="advanced-settings">
        <summary>
          Advanced settings
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="advanced-settings-body">
          <Toggle
            checked={s.friendlyRobber}
            onChange={(v) => change("friendlyRobber", v)}
            label="Friendly robber"
            description="Protect players with fewer than 3 visible points."
            disabled={disabled}
          />
          <Toggle
            checked={s.balancedNumbers}
            onChange={(v) => change("balancedNumbers", v)}
            label="Balanced numbers"
            description="Prevent adjacent 6 and 8 tokens."
            disabled={disabled}
          />
          <Toggle
            checked={s.allowPlayerTrading}
            onChange={(v) => change("allowPlayerTrading", v)}
            label="Player trading"
            disabled={disabled}
          />
          <Toggle
            checked={s.pairedTurns}
            onChange={(v) => change("pairedTurns", v)}
            label="Paired turns for 5–6 players"
            description="A second player gets an action phase after each turn."
            disabled={disabled}
          />
          <div className="settings-grid">
            <SettingsSelect
              label="Hard hand limit"
              value={s.hardHandLimit}
              options={[0, 10, 15, 20, 25, 30, 40, 50]}
              format={(n) => (n === 0 ? "Off" : String(n))}
              help="Excess resource cards automatically return to the bank."
              disabled={disabled}
              onChange={(n) => change("hardHandLimit", n)}
            />
            <label className="field-label">
              Board seed
              <input
                key={s.seed}
                disabled={disabled}
                defaultValue={s.seed || ""}
                onBlur={(e) => {
                  if (e.target.value !== s.seed) change("seed", e.target.value);
                }}
                placeholder="Random"
                maxLength={40}
              />
            </label>
          </div>
        </div>
      </details>
    </div>
  );
}
function Chat({ lobby, command, compact = false }) {
  const [text, setText] = useState(""),
    end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lobby.messages?.length]);
  return (
    <section className={`chat-panel ${compact ? "compact" : ""}`}>
      <div className="panel-heading">
        <MessageSquare size={17} />
        <h3>Chat</h3>
      </div>
      <div className="chat-messages">
        {!lobby.messages?.length && <p className="chat-empty">No messages.</p>}
        {lobby.messages?.map((m, i) => (
          <p key={m.id || i}>
            <strong>{m.name}</strong>
            <span>{m.text}</span>
          </p>
        ))}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={async (e) => {
          e.preventDefault();
          if (text.trim() && (await command("chat", { text: text.trim() })))
            setText("");
        }}
      >
        <input
          aria-label="Message"
          placeholder="Message…"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" aria-label="Send message" disabled={!text.trim()}>
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
function WaitingRoom({ lobby, meId, command, copyInvite, busy }) {
  const host = meId === lobby.hostId,
    me = lobby.players.find((p) => p.id === meId),
    allReady = lobby.players
      .filter((p) => p.id !== lobby.hostId)
      .every((p) => p.isBot || (p.ready && p.connected)),
    canStart = host && lobby.players.length >= 2 && allReady;
  return (
    <main className="waiting-page">
      <section className="lobby-banner">
        <img src="/assets/island-hero.png" alt="Island coast" />
        <div />
        <span className="eyebrow">LOBBY</span>
        <h1>{lobby.name}</h1>
        <p>
          <span>
            {lobby.isPrivate ? <LockKeyhole size={14} /> : <Globe2 size={14} />}{" "}
            {lobby.isPrivate ? "Private lobby" : "Public lobby"}
          </span>
          <span>·</span>
          <span>
            {lobby.players.length} of {lobby.settings.maxPlayers} players
          </span>
        </p>
        <Button variant="light" onClick={copyInvite}>
          <Copy size={16} />
          Copy invite link<span className="invite-code">{lobby.id}</span>
        </Button>
      </section>
      <div className="waiting-layout">
        <section className="crew-panel">
          <div className="section-title">
            <div>
              <h2>Players</h2>
            </div>
            <span className="count-badge">
              {lobby.players.length}/{lobby.settings.maxPlayers}
            </span>
          </div>
          <div className="crew-list">
            {Array.from({ length: lobby.settings.maxPlayers }, (_, i) => {
              const p = lobby.players[i];
              return p ? (
                <div className="crew-member" key={p.id}>
                  <div className="avatar" style={{ "--player": p.color }}>
                    {p.isBot ? <Bot size={23} /> : p.name.slice(0, 1).toUpperCase()}
                    {!p.isBot && <span className={p.connected ? "online" : "offline"} />}
                  </div>
                  <div>
                    <strong>
                      {p.name} {p.id === meId && <small>(you)</small>}
                    </strong>
                    <span>
                      {p.id === lobby.hostId ? (
                        <>
                          <Crown size={12} /> Host
                        </>
                      ) : p.isBot ? (
                        `Bot · ${p.difficulty[0].toUpperCase()}${p.difficulty.slice(1)}`
                      ) : !p.connected ? (
                        "Reconnecting…"
                      ) : p.ready ? (
                        "Ready"
                      ) : (
                        "Not ready"
                      )}
                    </span>
                  </div>
                  {p.id === lobby.hostId ? (
                    <Crown className="host-crown" size={19} />
                  ) : p.ready ? (
                    <Check className="ready-check" size={19} />
                  ) : (
                    <span className="waiting-dot" />
                  )}
                  {host && p.id !== meId && (
                    <div className="crew-options">
                      {p.isBot ? (
                        <select className="bot-difficulty" aria-label={`Difficulty for ${p.name}`} value={p.difficulty}
                          disabled={!!busy} onChange={(e) => command("configureBot", { playerId: p.id, difficulty: e.target.value })}>
                          <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
                        </select>
                      ) : <button
                        title={`Make ${p.name} host`}
                        aria-label={`Make ${p.name} host`}
                        onClick={() =>
                          command("transferHost", { playerId: p.id })
                        }
                      >
                        <Crown size={14} />
                      </button>}
                      <button
                        title={`Remove ${p.name}`}
                        aria-label={`Remove ${p.name}`}
                        onClick={() =>
                          command("kickPlayer", { playerId: p.id })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button key={i} className="empty-seat" onClick={copyInvite}>
                  <span>
                    <Plus size={20} />
                  </span>
                  <div>
                    <strong>Open slot</strong>
                    <small>Click to copy the invite link</small>
                  </div>
                </button>
              );
            })}
          </div>
          {host && lobby.players.length < lobby.settings.maxPlayers && (
            <Button className="add-bot" variant="outline" disabled={!!busy} onClick={() => command("addBot", { difficulty: "normal" })}>
              <Bot size={18} /> Add bot
            </Button>
          )}
          {lobby.players.some(p => p.isBot) && <p className="bot-help">Bots run in the host’s browser. Keep it open during the game.</p>}
          <div className="crew-start">
            {host ? (
              <>
                <Button
                  className="full"
                  disabled={!canStart || !!busy}
                  onClick={() => command("startGame")}
                >
                  <Flag size={18} />
                  Start game
                  <ArrowRight size={17} />
                </Button>
                <p>
                  {lobby.players.length < 2
                    ? "At least 2 players are required."
                    : allReady
                      ? "All players are ready."
                      : "Waiting for players to be ready."}
                </p>
              </>
            ) : (
              <>
                <Button
                  className="full"
                  variant={me?.ready ? "outline" : ""}
                  onClick={() => command("setReady", { ready: !me?.ready })}
                >
                  <Check size={18} />
                  {me?.ready ? "Not ready" : "Ready"}
                </Button>
                <p>The host will launch the game when everyone is ready.</p>
              </>
            )}
          </div>
          <Chat lobby={lobby} command={command} />
        </section>
        <section className="rules-panel">
          <div className="settings-heading">
            <h2>Game settings</h2>
            {!host && <p>Only the host can edit.</p>}
          </div>
          {host && (
            <div className="lobby-meta-settings">
              <label className="field-label">
                Lobby name
                <input
                  defaultValue={lobby.name}
                  maxLength={48}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== lobby.name)
                      command("configureLobby", { name: e.target.value });
                  }}
                />
              </label>
              <Toggle
                label="Private lobby"
                checked={lobby.isPrivate}
                onChange={(isPrivate) =>
                  command("configureLobby", { isPrivate })
                }
              />
            </div>
          )}
          <SettingsForm
            settings={lobby.settings}
            disabled={!host}
            onChange={(settings) => command("configureLobby", { settings })}
          />
        </section>
      </div>
    </main>
  );
}

function Building({ type, color, x = 0, y = 0, ghost = false }) {
  const size = type === "city" ? 46 : 36;
  return (
    <g
      pointerEvents="none"
      transform={`translate(${x},${y})`}
      opacity={ghost ? 0.65 : 1}
    >
      <ellipse
        cy="9"
        rx={type === "city" ? 18 : 14}
        ry="7"
        fill={color}
        stroke="#f7e9bd"
        strokeWidth="1.8"
      />
      <svg
        x={-size / 2}
        y={-size + 15}
        width={size}
        height={size}
        viewBox={`${type === "city" ? 724 : 0} 0 724 724`}
      >
        <image href="/assets/pieces-atlas.png" width="2172" height="724" />
      </svg>
    </g>
  );
}
function Board({ game, meId, mode, previewCities, onAction }) {
  const b = game.board,
    vertices = useMemo(
      () => Object.fromEntries(b.vertices.map((v) => [v.id, v])),
      [b.vertices],
    ),
    colors = Object.fromEntries(game.players.map((p) => [p.id, p.color]));
  const xs = b.hexes.map((h) => h.x),
    ys = b.hexes.map((h) => h.y),
    minX = Math.min(...xs) - 108,
    minY = Math.min(...ys) - 110,
    width = Math.max(...xs) - minX + 108,
    height = Math.max(...ys) - minY + 110;
  const active = game.activePlayerId === meId,
    legal = game.legal || {},
    settlementPhase = game.phase === "setupSettlement",
    roadPhase = game.phase === "setupRoad" || game.roadBuildingRemaining > 0;
  const settlements = new Set(
      active && (settlementPhase || mode === "settlement")
        ? legal.settlements
        : [],
    ),
    roads = new Set(
      active && (roadPhase || mode === "road") ? legal.roads : [],
    ),
    cities = new Set(active && (mode === "city" || previewCities) ? legal.cities : []);
  const robber = robberPlacement(game, meId);
  const portGroups = [];
  const used = new Set();
  for (const v of b.vertices) {
    if (!v.port || used.has(v.id)) continue;
    used.add(v.id);
    const n = b.vertices.find(
      (n) =>
        n.port === v.port && !used.has(n.id) && v.neighborIds?.includes(n.id),
    );
    if (n) used.add(n.id);
    const x = (v.x + (n?.x ?? v.x)) / 2,
      y = (v.y + (n?.y ?? v.y)) / 2;
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = x - cx,
      dy = y - cy,
      l = Math.hypot(dx, dy);
    portGroups.push({
      x: x + (dx / l) * 28,
      y: y + (dy / l) * 28,
      type: v.port,
      key: v.id,
    });
  }
  return (
    <svg
      className="game-board"
      tabIndex={-1}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      aria-label="Interactive Catan board"
    >
      <defs>
        <filter id="tile-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="5"
            stdDeviation="3"
            floodColor="#061f23"
            floodOpacity=".5"
          />
        </filter>
        <radialGradient id="sea">
          <stop stopColor="#38716d" />
          <stop offset="1" stopColor="#153b3c" />
        </radialGradient>
        {b.hexes.map((h) => (
          <clipPath key={h.id} id={`hex-${h.id}`}>
            <polygon
              points={Array.from({ length: 6 }, (_, i) => {
                const a = ((i * 60 - 30) * Math.PI) / 180;
                return `${h.x + Math.cos(a) * 58.5},${h.y + Math.sin(a) * 58.5}`;
              }).join(" ")}
            />
          </clipPath>
        ))}
      </defs>
      <rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        rx="14"
        fill="url(#sea)"
      />
      <g opacity=".09" fill="none" stroke="#cfe5ce" strokeWidth=".6">
        {Array.from({ length: 18 }, (_, i) => (
          <ellipse
            key={i}
            cx={minX + width / 2}
            cy={minY + height / 2}
            rx={100 + i * 23}
            ry={80 + i * 21}
          />
        ))}
      </g>
      <g
        className="map-compass"
        transform={`translate(${minX + 42},${minY + 48})`}
        fill="none"
        stroke="#b9cbb4"
      >
        <circle r="22" opacity=".3" />
        <path d="M0-31V31 M-31 0H31 M0-23 6 0 0 23-6 0Z" opacity=".5" />
        <text
          y="-36"
          textAnchor="middle"
          stroke="none"
          fill="#bbcebb"
          fontSize="9"
        >
          N
        </text>
      </g>
      {b.hexes.map((h) => {
        const points = Array.from({ length: 6 }, (_, i) => {
          const a = ((i * 60 - 30) * Math.PI) / 180;
          return `${h.x + Math.cos(a) * 60},${h.y + Math.sin(a) * 60}`;
        }).join(" ");
        const tile = META[h.terrain]?.tile || 0;
        const state = robber?.state(h.id), selectable = state === "destination";
        const hint = ROBBER_TILE_HINTS[state];
        return (
          <g
            key={h.id}
            className={selectable ? "hex-selectable" : ""}
            onClick={() =>
              selectable && onAction("moveRobber", { hexId: h.id })
            }
            role={selectable ? "button" : state ? "img" : undefined}
            data-robber-state={state}
            tabIndex={selectable ? 0 : undefined}
            aria-label={[META[h.terrain]?.name, h.number || null, hint].filter(Boolean).join(", ")}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && selectable) {
                e.preventDefault();
                onAction("moveRobber", { hexId: h.id });
              }
            }}
          >
            {hint && !selectable && <title>{hint}</title>}
            <polygon
              points={points}
              fill={META[h.terrain]?.color}
              stroke="#d2bc83"
              strokeWidth="3"
              filter="url(#tile-shadow)"
            />
            <g clipPath={`url(#hex-${h.id})`}>
              <svg
                x={h.x - 60}
                y={h.y - 60}
                width="120"
                height="120"
                viewBox={`${(tile % 3) * 512} ${Math.floor(tile / 3) * 512} 512 512`}
              >
                <image
                  href="/assets/terrain-atlas.png"
                  width="1536"
                  height="1024"
                />
              </svg>
              <polygon points={points} fill="#173b2b" opacity=".07" />
            </g>
            <polygon points={points} className="deal-tile-cue" data-deal-tile={h.id} aria-hidden="true" />
            <RobberHexMark state={state} points={points} x={h.x} y={h.y} />
            {h.number && (
              <g transform={`translate(${h.x},${h.y + 2})`}>
                <circle r="18.5" fill="#0d2928" opacity=".3" cy="3" />
                <circle
                  r="18"
                  fill="#f6ebce"
                  stroke="#a7915f"
                  strokeWidth="1.5"
                />
                <text
                  textAnchor="middle"
                  y="4"
                  fontFamily="Georgia,serif"
                  fontSize="22"
                  fontWeight="bold"
                  fill={[6, 8].includes(h.number) ? "#ac4d36" : "#333a32"}
                >
                  {h.number}
                </text>
                <text
                  textAnchor="middle"
                  y="13"
                  fontSize="7"
                  letterSpacing=".4"
                  fill={[6, 8].includes(h.number) ? "#ac4d36" : "#71684e"}
                >
                  {"•".repeat(6 - Math.abs(7 - h.number))}
                </text>
              </g>
            )}
            {game.robberHexId === h.id && (
              <g transform={`translate(${h.x + 22},${h.y - 19})`}>
                <ellipse cy="17" rx="13" ry="5" fill="#092522" opacity=".5" />
                <svg
                  x="-23"
                  y="-28"
                  width="46"
                  height="46"
                  viewBox="1448 0 724 724"
                >
                  <image
                    href="/assets/pieces-atlas.png"
                    width="2172"
                    height="724"
                  />
                </svg>
              </g>
            )}
          </g>
        );
      })}
      {portGroups.map((p) => (
        <g key={p.key} transform={`translate(${p.x},${p.y})`}>
          <rect
            x="-22"
            y="-11"
            width="44"
            height="23"
            rx="9"
            fill="#123737"
            stroke="#a9b7a0"
            strokeOpacity=".4"
          />
          <text
            y="4"
            textAnchor="middle"
            fill="#f0e2bb"
            fontSize="11"
            fontWeight="600"
          >
            {p.type === "any"
              ? "3:1"
              : `${{ wood: "Wd", wool: "Wl", wheat: "Wh", brick: "Br", ore: "Or" }[p.type]} 2:1`}
          </text>
          <title>
            {p.type === "any"
              ? "Any resource 3:1"
              : `${META[p.type]?.name} 2:1`}{" "}
            port
          </title>
        </g>
      ))}
      {b.edges
        .filter((e) => e.owner)
        .map((e) => {
          const a = vertices[e.a],
            z = vertices[e.b];
          return (
            <g key={e.id}>
              <line
                x1={a.x}
                y1={a.y + 2}
                x2={z.x}
                y2={z.y + 2}
                stroke="#0b2525"
                strokeWidth="11"
                strokeLinecap="round"
                opacity=".5"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={z.x}
                y2={z.y}
                stroke="#ede0ba"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={z.x}
                y2={z.y}
                stroke={colors[e.owner]}
                strokeWidth="7"
                strokeLinecap="round"
              />
            </g>
          );
        })}
      {b.edges
        .filter((e) => roads.has(e.id))
        .map((e) => {
          const a = vertices[e.a],
            z = vertices[e.b];
          return (
            <g
              key={e.id}
              className="road-target"
              role="button"
              tabIndex="0"
              aria-label={`Build road ${e.id}`}
              onClick={() => onAction("placeRoad", { edgeId: e.id })}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") onAction("placeRoad", { edgeId: e.id });
              }}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={z.x}
                y2={z.y}
                stroke="#ffe2a0"
                strokeWidth="5"
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={z.x}
                y2={z.y}
                stroke="transparent"
                strokeWidth="22"
              />
              <circle cx={(a.x + z.x) / 2} cy={(a.y + z.y) / 2} r="11" fill="transparent" />
            </g>
          );
        })}
      {b.vertices.filter((v) => v.building).map((v) => {
        const selectable = cities.has(v.id);
        const choose = () => onAction("upgradeCity", { vertexId: v.id });
        const renderPiece = (type) => (
          <Building type={type} color={colors[v.building.owner]} x={v.x} y={v.y} />
        );
        if (selectable && previewCities) {
          return <CityUpgradePreview key={v.id} x={v.x} y={v.y} onBuild={choose} renderPiece={renderPiece} />;
        }
        return (
          <g
            key={v.id}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            className={selectable ? "city-target" : ""}
            aria-label={selectable ? `Upgrade settlement ${v.id}` : undefined}
            onClick={selectable ? choose : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectable) choose();
            }}
          >
            {selectable && (
              <circle
                cx={v.x}
                cy={v.y}
                r="21"
                fill="#f5d58b"
                fillOpacity=".3"
                stroke="#ffe3a5"
                strokeDasharray="4 3"
              />
            )}
            {renderPiece(v.building.type)}
          </g>
        );
      })}
      {b.vertices
        .filter((v) => settlements.has(v.id))
        .map((v) => (
          <g
            key={v.id}
            className="settlement-target"
            role="button"
            tabIndex="0"
            aria-label={`Build settlement ${v.id}`}
            onClick={() => onAction("placeSettlement", { vertexId: v.id })}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                onAction("placeSettlement", { vertexId: v.id });
            }}
          >
            <circle
              cx={v.x}
              cy={v.y}
              r="10"
              fill="#fff0bd"
              stroke="#8b6c35"
              strokeWidth="2"
            />
            <path
              d={`M${v.x - 3.5},${v.y}h7 M${v.x},${v.y - 3.5}v7`}
              stroke="#5c704e"
              strokeWidth="1.5"
            />
          </g>
        ))}
    </svg>
  );
}

const DEV_META = {
  knight: {
    name: "Knight",
    icon: Shield,
    description:
      "Move the robber and steal a random resource if an adjacent opponent has cards. Counts toward Largest Army.",
  },
  victoryPoint: {
    name: "Victory point",
    icon: Trophy,
    description:
      "Adds one hidden victory point to your score as soon as you draw it.",
  },
  roadBuilding: {
    name: "Road building",
    icon: Route,
    description:
      "Place up to two roads for free.",
  },
  invention: {
    name: "Invention",
    icon: Sparkles,
    description: "Take two resources from the bank.",
  },
  monopoly: {
    name: "Monopoly",
    icon: Crown,
    description:
      "Take all cards of one resource from the other players.",
  },
};
function Dice({ value }) {
  const positions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return (
    <span className="die" aria-label={`Die ${value || "not rolled"}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <i className={positions[value]?.includes(i) ? "dot" : ""} key={i} />
      ))}
    </span>
  );
}
function ResourceSummary({ resources }) {
  return (
    <span className="resource-summary">
      {RES.filter((r) => resources?.[r] > 0).map((r) => (
        <span key={r} title={META[r].name} style={{ color: META[r].color }}>
          <ResourceIcon resource={r} size={16} />
          {resources[r]}
        </span>
      ))}
    </span>
  );
}
const developmentTrayId = "match-development-tray";

function Game({ lobby, meId, command, busy, onHelp, onAbandon, onCopyInvite, onLeave }) {
  const game = lobby.game,
    me = game.players.find((p) => p.id === meId),
    active = game.players.find((p) => p.id === game.activePlayerId),
    myTurn = meId === game.activePlayerId;
  const [mode, setMode] = useState(null),
    [trade, setTrade] = useState(null),
    [devId, setDevId] = useState(null),
    [sidebar, setSidebar] = useState("activity"),
    [chatFocus, setChatFocus] = useState(0),
    [now, setNow] = useState(Date.now());
  const devTrigger = useRef(null), matchPage = useRef(null);
  useLayoutEffect(() => {
    if (chatFocus) matchPage.current?.querySelector(".chat-input input")?.focus({ preventScroll: true });
  }, [chatFocus]);
  const remindRoll = useRollReminder(myTurn && game.phase === "roll" && !game.roadBuildingRemaining && !busy);
  const deals = useCardDeals({ matchId: lobby.matchId || lobby.id, stream: lobby.cardDealStream,
    game, me: game.phase === "finished" ? null : me });
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setMode(null);
    setTrade(null);
    setDevId(null);
  }, [game.phase, game.activePlayerId, game.roadBuildingRemaining, game.turn]);
  if (!me)
    return (
      <main className="loading-state">
        <Compass size={40} />
        <h2>Loading game…</h2>
      </main>
    );
  if (game.phase === "finished")
    return <MatchResults key={lobby.matchId} {...{ lobby, meId, command, busy, onCopyInvite, onLeave }} Board={Board} resourceMeta={META} />;
  const action = async (type, payload = {}) => {
    if (type !== "playDevelopment") setDevId(null);
    const result = await command("gameAction", { type, ...payload });
    if (
      result &&
      ["placeSettlement", "placeRoad", "upgradeCity"].includes(type)
    )
      setMode(null);
    return result;
  };
  const canAct = myTurn && game.phase === "action" && !game.roadBuildingRemaining;
  const openTrade = () => { setDevId(null); setMode(null); setTrade(true); };
  const closeTrade = () => setTrade(false);
  const discardCount = game.phase === "discard" ? game.discardRequired?.[meId] || 0 : 0;
  const blockingPrompt = game.phase === "finished" || discardCount > 0 ||
    (myTurn && (["robber", "steal"].includes(game.phase) || game.roadBuildingRemaining > 0));
  const dev = !blockingPrompt && me.development?.find(card => card.id === devId);
  const closeDevelopment = () => { setDevId(null); devTrigger.current?.focus({ preventScroll: true }); };
  const inspectDevelopment = (id, trigger) => {
    if (id === devId) return closeDevelopment();
    devTrigger.current = trigger;
    setTrade(false);
    setMode(null);
    setDevId(id);
  };
  const playDevelopment = async (payload) => {
    const tray = matchPage.current?.querySelector(`#${developmentTrayId}`);
    if (await action("playDevelopment", payload)) {
      setDevId(id => id === payload.cardId ? null : id);
      if (document.activeElement === document.body || tray?.contains(document.activeElement)) {
        matchPage.current?.querySelector(".game-board")?.focus({ preventScroll: true });
      }
    }
  };
  const afford = (type) =>
      Object.entries(COSTS[type]).every(
        ([r, n]) => (me.resources?.[r] || 0) >= n,
      ),
    seconds = game.deadline
      ? Math.max(0, Math.ceil((game.deadline - now) / 1000))
      : null;
  const phaseText =
    game.phase === "setupSettlement"
      ? "Choose a settlement location."
      : game.phase === "setupRoad"
        ? "Place a road beside your new settlement."
        : game.roadBuildingRemaining
          ? `Place ${game.roadBuildingRemaining} free road${game.roadBuildingRemaining === 1 ? "" : "s"}.`
          : game.phase === "roll"
            ? "Roll the dice."
            : game.phase === "discard"
              ? discardCount ? null : "Waiting for players to return resources."
              : game.phase === "robber"
                ? "Move the robber to a highlighted tile."
                : game.phase === "steal"
                  ? null
                  : mode
                    ? `Choose a highlighted ${mode === "road" ? "edge" : "location"} for your ${mode}.`
                    : "Trade or build, then end your turn.";
  const dealtDevelopment = me.development?.filter(card => !deals.pending.has(card.id)) || [];
  const offered = game.tradeOffers?.[0] ?? game.tradeOffer,
    offerOwner = game.players.find((p) => p.id === offered?.from),
    canAccept =
      offered &&
      me.id !== offered.from &&
      playerTradesAvailable(game) &&
      RES.every((r) => (me.resources?.[r] || 0) >= (offered.want?.[r] || 0));
  const openChat = () => {
    setSidebar("chat");
    setChatFocus((request) => request + 1);
  };
  const dismiss = () => {
    if (trade && canAct) closeTrade();
    else if (mode) setMode(null);
    else return false;
    return true;
  };
  return (
    <main className="game-page" ref={matchPage}>
      <MatchShortcuts scope={matchPage} onChat={openChat} onEscape={dismiss} />
      <div className="game-topline">
        <div>
          <span className="eyebrow">
            {game.settings.extendedBoard ? "EXPANDED BOARD" : "CLASSIC BOARD"}
          </span>
          <span className="game-round">
            Turn {game.turn || 1}
            {game.pairedPlayer ? " · Paired action phase" : ""}
          </span>
        </div>
        <div className="game-top-meta">
          <span>
            <Trophy size={15} />
            {game.settings.victoryPoints} to win
          </span>
          <span>
            <Package size={15} />
            {game.settings.discardThreshold} safe cards
          </span>
          <button className="text-button" {...shortcutProps("help")} onClick={onHelp}>
            <CircleHelp size={15} />
            Rules
          </button>
          {onAbandon && (
            <button
              className="text-button"
              aria-label="End current match"
              onClick={onAbandon}
            >
              <LogOut size={15} />
              End match
            </button>
          )}
        </div>
      </div>
      <div className="game-layout">
        <aside className="players-panel">
          <div className="panel-heading">
            <Users size={16} />
            <h3>Players</h3>
          </div>
          {game.players.map((p) => {
            const lp = lobby.players.find((x) => x.id === p.id);
            return (
              <div
                key={p.id}
                className={`player-card ${p.id === game.activePlayerId ? "active" : ""} ${p.id === meId ? "self" : ""}`}
                style={{ "--player": p.color }}
              >
                <div className="player-card-top">
                  <span className="player-token">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.id === meId
                        ? "You"
                        : lp?.isBot
                          ? `Bot · ${lp.difficulty[0].toUpperCase()}${lp.difficulty.slice(1)}`
                        : lp?.connected === false
                          ? "Reconnecting…"
                          : p.id === game.activePlayerId
                            ? "Current turn"
                            : "Waiting"}
                    </small>
                  </div>
                  <span className="player-score">
                    {p.id === meId ? p.score : p.visibleScore}
                    <small>VP</small>
                  </span>
                </div>
                <div className="player-stats">
                  <PlayerHandBacks playerId={p.id} kind="resource" count={p.resourceCount} discardThreshold={game.settings.discardThreshold} />
                  <PlayerHandBacks playerId={p.id} kind="development" count={p.developmentCount} />
                  <span title="Played knights">
                    <Shield size={14} />
                    {p.knights}
                  </span>
                  <span title="Longest continuous route">
                    <Route size={14} />
                    {p.longestRoad || 0}
                  </span>
                </div>
                {(game.longestRoadHolder === p.id ||
                  game.largestArmyHolder === p.id) && (
                  <div className="player-awards">
                    {game.longestRoadHolder === p.id && (
                      <span>
                        <Route size={11} />
                        Longest route +2
                      </span>
                    )}
                    {game.largestArmyHolder === p.id && (
                      <span>
                        <Swords size={11} />
                        Largest army +2
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="bank-panel">
            <span className="eyebrow">THE BANK</span>
            <div>
              {RES.map((r) => (
                <span key={r} data-deal-bank={r} title={`${META[r].name} remaining`}>
                  <ResourceIcon resource={r} size={16} />
                  <strong>{game.bank[r]}</strong>
                </span>
              ))}
            </div>
            <small data-deal-bank="development">
              <ScrollText size={13} />
              {game.developmentRemaining} development cards left
            </small>
          </div>
          <div className="pieces-panel">
            <span className="eyebrow">SUPPLY</span>
            <div>
              <span>
                <Route size={17} />
                {me.roadsLeft} roads
              </span>
              <span>
                <Home size={17} />
                {me.settlementsLeft} settlements
              </span>
              <span>
                <Building2 size={17} />
                {me.citiesLeft} cities
              </span>
            </div>
          </div>
        </aside>
        <section className="board-section">
          <div className={`turn-banner ${myTurn ? "your-turn" : ""}`}>
            <span className="turn-avatar" style={{ background: active?.color }}>
              {active?.name.slice(0, 1)}
            </span>
            <div>
              <strong>
                {myTurn ? "Your turn" : `${active?.name || "Player"}’s turn`}
              </strong>
              <span>
                {myTurn || game.phase === "discard"
                  ? phaseText
                  : "Waiting for the active player."}
              </span>
              {myTurn && game.phase === "robber" && game.settings.friendlyRobber && <FriendlyRobberHint />}
            </div>
            {seconds !== null && (
              <span className={`turn-clock ${seconds <= 15 ? "urgent" : ""}`}>
                <Clock3 size={16} />
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
            )}
            {mode && (
              <button
                className="icon-button"
                aria-label="Cancel build selection"
                onClick={() => setMode(null)}
              >
                <X size={17} />
              </button>
            )}
          </div>
          <div className="board-frame">
            <Board
              game={game}
              meId={meId}
              mode={mode}
              previewCities={!dev && !mode && !busy && canAct && afford("city")}
              onAction={action}
            />
            <div className="board-caption">
              <span>
                {game.settings.seed ? `Seed: ${game.settings.seed}` : ""}
              </span>
            </div>
          </div>
          <div className="match-dock">
            <div className="action-bar">
              {dev && (
                <DevelopmentTray id={developmentTrayId} key={dev.id} card={dev} game={game} meta={DEV_META[dev.type] || DEV_META.knight}
                  restriction={developmentRestriction(dev, game, meId)} busy={!!busy} onClose={closeDevelopment} onPlay={playDevelopment}
                  resourceTypes={RES} resourceMeta={META} />
              )}
              {game.phase === "steal" && myTurn && (
                <RobberTray players={game.players} targetIds={game.stealTargets} busy={!!busy} onAction={action} />
              )}
              <div className="dice-group">
                <Dice value={game.dice?.[0]} />
                <Dice value={game.dice?.[1]} />
                {game.dice && (
                  <span className="dice-total">
                    {game.dice[0] + game.dice[1]}
                  </span>
                )}
              </div>
              <div className="build-actions">
                {[
                  ["road", Route, "Road"],
                  ["settlement", Home, "Settlement"],
                  ["city", Building2, "City"],
                ].map(([type, Icon, label]) => (
                  <button
                    key={type}
                    className={`build-action ${mode === type ? "selected" : ""}`}
                    aria-pressed={mode === type}
                    {...shortcutProps(type)}
                    disabled={
                      !canAct ||
                      !!busy ||
                      !afford(type) ||
                      !(type === "road"
                        ? me.roadsLeft
                        : type === "settlement"
                          ? me.settlementsLeft
                          : me.citiesLeft)
                    }
                    onClick={() => { setDevId(null); setTrade(null); setMode(mode === type ? null : type); }}
                  >
                    <Icon size={18} />
                    <span>
                      {label}
                      <Cost cost={COSTS[type]} />
                    </span>
                  </button>
                ))}
                <button
                  className="build-action"
                  {...shortcutProps("development")}
                  disabled={
                    !canAct ||
                    !!busy ||
                    !afford("development") ||
                    !game.developmentRemaining
                  }
                  onClick={() => action("buyDevelopment")}
                >
                  <ScrollText size={18} />
                  <span>
                    Develop
                    <Cost cost={COSTS.development} />
                  </span>
                </button>
              </div>
              <div className="turn-actions">
                {myTurn && game.phase === "roll" ? (
                  <Button
                    className="roll-reminder"
                    data-roll-reminder={remindRoll || undefined}
                    {...shortcutProps("roll")}
                    onClick={() => action("rollDice")}
                    disabled={!!busy || game.roadBuildingRemaining > 0}
                  >
                    <Dices size={17} />
                    Roll dice
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={!canAct || !!busy}
                      aria-expanded={!!trade && canAct}
                      aria-controls={trade && canAct ? "match-trade-tray" : undefined}
                      onClick={trade ? closeTrade : openTrade}
                    >
                      <Handshake size={17} />
                      Trade
                    </Button>
                    <Button
                      {...shortcutProps("endTurn")}
                      disabled={!canAct || !!busy}
                      onClick={() => action("endTurn")}
                    >
                      End turn
                      <ArrowRight size={16} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {offered && (
              <div className="trade-offer">
                <Handshake size={20} />
                <div>
                  <strong>{offerOwner?.name} offers a trade</strong>
                  <ResourceOfferCards give={offered.from === meId ? offered.give : offered.want}
                    get={offered.from === meId ? offered.want : offered.give} resourceTypes={RES} resourceMeta={META} />
                </div>
                {offered.from === meId ? (
                  <Button variant="outline" onClick={() => action("cancelTrade", { offerId: offered.id })}>
                    Cancel offer
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" {...shortcutProps("decline")} disabled={!!busy} onClick={() => action("declineTrade", { offerId: offered.id })}>
                      Decline
                    </Button>
                    <Button
                      {...shortcutProps("accept")}
                      disabled={!canAccept || !!busy}
                      onClick={() => action("acceptTrade", { offerId: offered.id })}
                    >
                      Accept trade
                    </Button>
                  </>
                )}
              </div>
            )}
            <section className="hand-section">
              <ResourceCardDraft game={game} me={me} offers={openTradeOffers(game)} tradeOpen={!!trade && canAct}
                canTrade={canAct} discardCount={discardCount} busy={!!busy} onOpen={openTrade} onClose={closeTrade}
                onAction={action} resourceTypes={RES} resourceMeta={META} pending={deals.pending} />
              <div className="hand-cards">
                <div className="development-hand" data-deal-hand="development">
                  {dealtDevelopment.length ? (
                    dealtDevelopment.map((card) => {
                      const meta = DEV_META[card.type] || DEV_META.knight,
                        Icon = meta.icon,
                        restriction = developmentRestriction(card, game, meId);
                      return (
                        <button
                          key={card.id}
                          data-deal-card={card.id}
                          className={`development-card ${card.type === "victoryPoint" ? "victory" : ""}`}
                          disabled={blockingPrompt}
                          aria-description={restriction || undefined}
                          aria-expanded={!blockingPrompt ? dev?.id === card.id : undefined}
                          aria-controls={dev?.id === card.id ? developmentTrayId : undefined}
                          onClick={event => inspectDevelopment(card.id, event.currentTarget)}
                        >
                          <Icon size={23} strokeWidth={1.3} />
                          <strong>{meta.name}</strong>
                          <small>
                            {card.type === "victoryPoint"
                              ? "+1 hidden VP"
                              : card.turnBought === game.turn
                                ? "Next turn"
                                : "Development"}
                          </small>
                        </button>
                      );
                    })
                  ) : (
                    <div className="empty-development">
                      <ScrollText size={23} strokeWidth={1.2} />
                      <span>No development cards</span>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>
        <aside className="game-sidebar">
          <div className="segmented small">
            <button
              className={sidebar === "activity" ? "selected" : ""}
              onClick={() => setSidebar("activity")}
            >
              <ScrollText size={14} />
              Game log
            </button>
            <button
              className={sidebar === "chat" ? "selected" : ""}
              {...shortcutProps("chat")}
              onClick={() => setSidebar("chat")}
            >
              <MessageSquare size={14} />
              Chat
            </button>
          </div>
          {sidebar === "chat" ? (
            <Chat lobby={lobby} command={command} compact />
          ) : (
            <div className="activity-feed">
              {[...(game.log || [])].reverse().map((entry, i) => (
                <div className="activity-entry" key={`${entry.at}-${i}`}>
                  <span className="activity-bullet" />
                  <p>{gameLogText(entry.text)}</p>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      <CardDealLayer scope={matchPage} game={game} me={me} deals={deals} resourceMeta={META} developmentMeta={DEV_META} />
    </main>
  );
}

function Guide({ onClose, feedback }) {
  return (
    <TableDialog title="Game rules" icon={ScrollText} onClose={onClose} dismissLabel="Close rules" feedback={feedback} wide>
      <div className="guide-grid">
        <section>
          <h3>
            <Flag size={19} /> The goal
          </h3>
          <p>
            Reach the configured victory point target on your own turn.
            Settlements are worth 1 point, cities 2. Longest Route and Largest
            Army are worth 2 each. Hidden victory cards add 1.
          </p>
          <h3>
            <Dices size={19} /> Your turn
          </h3>
          <p>
            Roll two dice. All players receive resources from matching hexes
            beside their settlements (1) and cities (2). Then trade, build and
            buy cards in any order. End your turn when you’re done. If the
            timer runs out, the game makes required choices automatically.
          </p>
          <h3>
            <Home size={19} /> Initial placement
          </h3>
          <p>
            Place a settlement and its adjacent road. Players place in forward
            order, then reverse order. Collect starting resources only from your
            second settlement. Buildings must be at least two edges apart.
            Two-player games use these rules without neutral players.
          </p>
        </section>
        <section>
          <h3>
            <Hammer size={19} /> Building costs
          </h3>
          <div className="guide-costs">
            {Object.entries(COSTS).map(([name, cost]) => (
              <div key={name}>
                <strong>
                  {name === "development"
                    ? "Development card"
                    : name.charAt(0).toUpperCase() + name.slice(1)}
                </strong>
                <ResourceSummary resources={cost} />
              </div>
            ))}
          </div>
          <h3>
            <Shield size={19} /> A seven & the robber
          </h3>
          <p>
            A 7 produces nothing. If you have more resource cards than the
            discard threshold, discard half your resource cards, rounded down.
            Move the robber to another hex and steal one random resource from a
            neighboring opponent. Its hex stops producing.
          </p>
          <h3>
            <ScrollText size={19} /> Development
          </h3>
          <p>
            Play one development card per turn, before rolling or during your
            actions. Newly bought cards wait until a later turn. Victory cards
            count automatically. Three played Knights claim Largest Army; a
            route of five roads can claim Longest Route.
          </p>
        </section>
      </div>
      <div className="guide-bottom">
        <Anchor size={22} />
        <p>
          Bank trades are 4 identical resources for 1. Build at a port to trade
          at 3:1, or 2:1 for its resource. Only the active player can trade.
        </p>
      </div>
      <KeyboardShortcuts />
    </TableDialog>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error, info) {
    console.error("The game view could not render:", error, info);
  }
  render() {
    return this.state.failed ? (
      <main className="table-recovery" role="alert">
        <Compass size={45} />
        <h2>Unable to display the game</h2>
        <p>Reload to reconnect to your game.</p>
        <button type="button" className="draft-command match-command" data-tone="gold" onClick={() => location.reload()}>
          <RefreshCw size={17} />
          Reload
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
