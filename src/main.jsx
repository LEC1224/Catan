import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { attachBotController } from "./bots/controller.js";
import {
  Anchor,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  Flag,
  Hammer,
  HelpCircle,
  Map,
  Maximize,
  MessageSquare,
  Minimize,
  Mountain,
  RefreshCw,
  ScrollText,
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
} from "lucide-react";
import { Sheep } from "./sheep-icon.js";
import { resourceName } from "../shared/resource-names.js";
import { gameLogText } from "./game-log-text.js";
import "./styles.css";
import { HomeScreen, LobbyHeader, WaitingRoom } from "./lobby.jsx";
import { Chat } from "./chat.jsx";
import { SoundToggle, useDecisionWarning, useSoundEffects } from "./sound.jsx";
import { lobbySoundCues } from "./sound-cues.js";
import { CardFace, MatchHands } from "./match-hand.jsx";
import { Board } from "./match-board.jsx";
import { DICE_THROW_DURATION, MatchDice, TurnClock } from "./match-hud.jsx";
import { KeyboardShortcuts, MatchShortcuts, shortcutProps } from "./match-shortcuts.jsx";
import { TradeOffers } from "./match-trade.jsx";
import { ResourceCardDraft } from "./resource-card-draft.jsx";
import { openTradeOffers } from "../shared/trades.js";
import { FriendlyRobberHint } from "./robber-guide.jsx";
import { CardDealLayer, PendingCardArrivals, PlayerHandBacks, useCardDeals } from "./card-deals.jsx";
import { MatchResults } from "./match-results.jsx";
import { DevelopmentTray, RobberTray, TableDialog, TableFeedback, developmentRestriction } from "./match-prompts.jsx";
import "./match.css";
import "./match-trade.css";
import "./match-framing.css";

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
function Cost({ cost }) {
  return (
    <span className="cost" aria-hidden="true">
      {Object.entries(cost).map(([r, n]) => (
        <span
          key={r}
          title={`${n} ${META[r].name}`}
          style={{ color: META[r].color }}
        >
          {Array.from({ length: n }, (_, i) => <ResourceIcon key={i} resource={r} size={13} />)}
        </span>
      ))}
    </span>
  );
}
const costDescription = (type) => `Cost: ${Object.entries(COSTS[type]).map(([resource, count]) => `${count} ${META[resource].name}`).join(", ")}`;
function App() {
  const [socket, setSocket] = useState(null),
    [connected, setConnected] = useState(false),
    [botSupport, setBotSupport] = useState(null),
    [meId, setMeId] = useState(null),
    [directory, setDirectory] = useState([]),
    [lobby, setLobby] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [help, setHelp] = useState(false),
    [abandon, setAbandon] = useState(false),
    [busy, setBusy] = useState("");
  const [name, setName] = useState(localStorage.getItem("catanName") || "");
  const [fullscreen, setFullscreen] = useState(false);
  const { enabled: soundEnabled, toggle: toggleSound, player: sound } = useSoundEffects();
  useDecisionWarning(connected ? lobby?.game : null, lobby?.meId, sound);
  const joinedLobbyId = useRef(null);
  const cardDealStream = useRef(0);
  const shell = useRef(null);
  const inMatch = !!lobby?.game;
  const canAbandon = inMatch && lobby.status === "playing" && lobby.game.phase !== "finished" && lobby.hostId === (meId || lobby.meId);
  useEffect(() => { if (!canAbandon) setAbandon(false); }, [canAbandon]);
  useEffect(() => {
    const update = () => {
      const isFullscreen = !!shell.current && document.fullscreenElement === shell.current;
      if (isFullscreen && !shell.current.classList.contains("match-shell")) {
        document.exitFullscreen().catch(() => {});
      }
      setFullscreen(isFullscreen);
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => {
    if (!inMatch && shell.current && document.fullscreenElement === shell.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [inMatch]);
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
      setBotSupport(null);
    });
    s.on("connect_error", () => setConnected(false));
    s.on("session", (session) => {
      setMeId(session.playerId);
      setBotSupport(session.features?.localBots === true);
    });
    s.on("directory", setDirectory);
    s.on("lobby", (l) => {
      const cues = lobbySoundCues(lastLobby, l);
      lastLobby = l;
      if (l?.meId) setMeId(l.meId);
      const nextId = l?.id || null;
      if (joinedLobbyId.current !== nextId) {
        history.replaceState({}, "", nextId ? `?lobby=${nextId}` : "/");
        joinedLobbyId.current = nextId;
      }
      setLobby(l && { ...l, cardDealStream: cardDealStream.current });
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
      history.replaceState({}, "", "/");
      setLobby(null);
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
  const toggleFullscreen = async () => {
    if (!shell.current) return;
    try {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
      else await shell.current.requestFullscreen({ navigationUI: "hide" });
    } catch {
      setError("Fullscreen is unavailable in this window.");
    }
  };
  const fullscreenLabel = fullscreen ? "Exit fullscreen" : "Fullscreen";
  const showAbandon = abandon && canAbandon;
  const feedback = <TableFeedback disconnected={inMatch && !connected}
    botsPaused={connected && lobby?.status === "playing" && lobby.botsPaused} error={error} notice={notice}
    onDismiss={() => { setError(""); setNotice(""); }} />;
  return (
    <div ref={shell} className={inMatch ? "match-shell" : "front-shell"}>
      {!inMatch && (
        <LobbyHeader
          connected={connected}
          inLobby={!!lobby}
          leaving={busy === "leaveLobby"}
          onLeave={leave}
          onHelp={() => setHelp(true)}
          soundControl={<SoundToggle enabled={soundEnabled} onToggle={toggleSound} className="front-button quiet icon" />}
        />
      )}
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
            soundControl={<SoundToggle enabled={soundEnabled} onToggle={toggleSound} className="match-tool" />}
            fullscreenControl={document.fullscreenEnabled && (
              <button type="button" className="match-tool match-fullscreen" aria-label={fullscreenLabel} title={fullscreenLabel} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
                <span>{fullscreenLabel}</span>
              </button>
            )}
          />
        ) : (
          <WaitingRoom
            lobby={lobby}
            meId={meId || lobby.meId}
            botSupport={botSupport}
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
    </div>
  );
}

const DEV_META = {
  knight: {
    name: "Knight",
    icon: Shield,
    tile: 0,
    color: "#454e54",
    description:
      "Move the robber and steal a random resource if an adjacent opponent has cards. Counts toward Largest Army.",
  },
  victoryPoint: {
    name: "Victory point",
    icon: Trophy,
    tile: 1,
    color: "#2b5c85",
    description:
      "Adds one hidden victory point to your score as soon as you draw it.",
  },
  roadBuilding: {
    name: "Road building",
    icon: Route,
    tile: 2,
    color: "#775d3a",
    description:
      "Place up to two roads for free.",
  },
  invention: {
    name: "Invention",
    icon: Sparkles,
    tile: 3,
    color: "#286459",
    description: "Take two resources from the bank.",
  },
  monopoly: {
    name: "Monopoly",
    icon: Crown,
    tile: 4,
    color: "#80601a",
    description:
      "Take all cards of one resource from the other players.",
  },
};
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

function Game({ lobby, meId, command, busy, onHelp, onAbandon, onCopyInvite, onLeave, soundControl, fullscreenControl }) {
  const game = lobby.game,
    me = game.players.find((p) => p.id === meId),
    active = game.players.find((p) => p.id === game.activePlayerId),
    myTurn = meId === game.activePlayerId;
  const [mode, setMode] = useState(null),
    [trade, setTrade] = useState(false),
    [devId, setDevId] = useState(null),
    [sidebar, setSidebar] = useState("activity"),
    [chatFocus, setChatFocus] = useState(0),
    [drawer, setDrawer] = useState(null),
    [compact, setCompact] = useState(() => matchMedia("(max-width: 950px)").matches),
    [activityPreference, setActivityPreference] = useState(null);
  const tradeTrigger = useRef(null), devTrigger = useRef(null), matchPage = useRef(null);
  useLayoutEffect(() => {
    if (chatFocus) matchPage.current?.querySelector(".chat-input input")?.focus({ preventScroll: true });
  }, [chatFocus]);
  const deals = useCardDeals({ matchId: lobby.matchId || lobby.id, stream: lobby.cardDealStream,
    game, me: game.phase === "finished" ? null : me, rollDelay: DICE_THROW_DURATION });
  useEffect(() => {
    const media = matchMedia("(max-width: 950px)");
    const change = () => { setCompact(media.matches); setDrawer(null); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    setMode(null);
    setTrade(false);
    setDevId(null);
  }, [game.phase, game.activePlayerId, game.roadBuildingRemaining, game.turn]);
  const discardCount = game.phase === "discard" ? game.discardRequired?.[meId] || 0 : 0;
  const blockingPrompt = game.phase === "finished" || discardCount > 0 ||
    (myTurn && (["robber", "steal"].includes(game.phase) || game.roadBuildingRemaining > 0));
  if (!me)
    return (
      <main className="loading-state">
        <Compass size={40} />
        <h2>Loading game…</h2>
      </main>
    );
  if (game.phase === "finished")
    return <MatchResults key={lobby.matchId} {...{ lobby, meId, command, busy, onCopyInvite, onLeave, soundControl, fullscreenControl }} Board={Board} resourceMeta={META} />;
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
  const trading = trade && canAct;
  const canRoll = myTurn && game.phase === "roll" && !game.roadBuildingRemaining && !busy;
  const rollId = game.dice && game.log?.findLast((entry) => entry.cue === "dice" || entry.cue === "diceSeven")?.seq;
  const activityOpen = (activityPreference ?? !compact) && drawer !== "players";
  const dev = !blockingPrompt && me.development?.find((card) => card.id === devId);
  const afford = (type) => Object.entries(COSTS[type]).every(([r, n]) => (me.resources?.[r] || 0) >= n);
  const canBuild = {
    road: canAct && afford("road") && !!game.legal?.roads?.length,
    settlement: canAct && afford("settlement") && !!game.legal?.settlements?.length,
    city: canAct && afford("city") && !!game.legal?.cities?.length,
  };
  const selectedBuild = canBuild[mode] ? mode : null;
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
                : selectedBuild
                  ? `Choose a highlighted ${selectedBuild === "road" ? "edge" : "location"} for your ${selectedBuild}.`
                  : null;
  const offers = openTradeOffers(game);
  const openTrade = () => { setDevId(null); setMode(null); setTrade(true); };
  const closeTrade = () => { setTrade(false); tradeTrigger.current?.focus(); };
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
  const openChat = () => {
    setDrawer(null);
    setActivityPreference(true);
    setSidebar("chat");
    setChatFocus((request) => request + 1);
  };
  const dismiss = () => {
    if (trading) closeTrade();
    else if (selectedBuild) setMode(null);
    else if (drawer) setDrawer(null);
    else if (compact && activityOpen) setActivityPreference(false);
    else return false;
    return true;
  };
  return (
    <main className="match-page" ref={matchPage}>
      <MatchShortcuts scope={matchPage} onChat={openChat} onEscape={dismiss} />
      <header className="match-toolbar">
        <div className="match-identity">
          <img src="/assets/lobby-crest.svg" alt="" width="28" height="32" />
          <strong title={lobby.name}>{lobby.name}</strong>
          <button type="button" className="match-tool match-invite" aria-label="Copy invite link" title="Copy invite link" onClick={onCopyInvite}>
            <Copy size={15} aria-hidden="true" />
          </button>
        </div>
        <div className={`turn-banner ${myTurn ? "your-turn" : ""}`}>
          <span className="turn-avatar" style={{ background: active?.color }} aria-hidden="true">{active?.name.slice(0, 1)}</span>
          <div className="turn-state">
            <strong>{myTurn ? "Your turn" : `${active?.name || "Player"}’s turn`}</strong>
            {phaseText && (myTurn || game.phase === "discard") && <span>{phaseText}</span>}
            {myTurn && game.phase === "robber" && game.settings.friendlyRobber && <FriendlyRobberHint />}
          </div>
          {game.deadline && <TurnClock key={game.deadline} deadline={game.deadline} limit={game.settings.turnSeconds} />}
          {selectedBuild && <button type="button" className="match-command" aria-label="Cancel build selection" onClick={() => setMode(null)}><X size={17} aria-hidden="true" /></button>}
        </div>
        <div className="match-top-controls">
          <div className="match-status">
            <span>Turn {game.turn || 1}</span>
            <span className="match-target"><Trophy size={14} aria-hidden="true" /> {game.settings.victoryPoints} to win</span>
            {game.pairedPlayer && <span className="paired-status">Paired turn</span>}
          </div>
          <div className="match-tools">
            <button type="button" className="match-tool match-drawer-button" aria-label="Players panel" title="Players" aria-expanded={drawer === "players"} aria-controls="match-players" onClick={() => setDrawer(drawer === "players" ? null : "players")}>
              <Users size={17} aria-hidden="true" />
            </button>
            <button type="button" className="match-tool" aria-label="Game log and chat" title="Game log and chat" aria-expanded={activityOpen} aria-controls="match-activity" onClick={() => { setDrawer(null); setActivityPreference(!activityOpen); }}>
              <MessageSquare size={16} aria-hidden="true" />
            </button>
            {fullscreenControl}
            {soundControl}
            <button type="button" className="match-tool" aria-label="Game guide" title="Game guide" {...shortcutProps("help")} onClick={onHelp}><CircleHelp size={17} aria-hidden="true" /></button>
            {onAbandon && (
              <button type="button" className="match-tool match-end" aria-label="End current match" title="End match" onClick={onAbandon}>
                <LogOut size={16} aria-hidden="true" /> <span>End match</span>
              </button>
            )}
            {lobby.status !== "playing" && <button type="button" className="match-tool" aria-label="Leave lobby" title="Leave lobby" onClick={onLeave}><LogOut size={16} aria-hidden="true" /></button>}
          </div>
        </div>
      </header>
      <div className="match-stage">
        <aside id="match-players" className={`players-panel ${drawer === "players" ? "drawer-open" : ""}`} aria-label="Players and bank">
          <div className="panel-heading">
            <Users size={16} />
            <h3>Players</h3>
          </div>
          <div className="match-player-list">
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
          </div>
          <div className="bank-panel">
            <h3>Bank</h3>
            <div>
              {RES.map((r) => (
                <span key={r} data-deal-bank={r} title={`${META[r].name} remaining`}>
                  <ResourceIcon resource={r} size={16} />
                  <strong>{game.bank[r]}</strong>
                </span>
              ))}
              <span role="img" data-deal-bank="development" title="Development cards remaining" aria-label={`${game.developmentRemaining} development cards remaining`}>
                <ScrollText size={16} aria-hidden="true" />
                <strong>{game.developmentRemaining}</strong>
              </span>
            </div>
          </div>
        </aside>
        <section className="board-section" aria-label="Play area">
          <Board key={lobby.matchId || lobby.id} game={game} matchId={lobby.matchId} meId={meId} mode={selectedBuild}
            canBuild={dev ? {} : canBuild} busy={!!busy} onAction={action} resourceMeta={META} />
        </section>
        {offers.length > 0 && <TradeOffers offers={offers} game={game} me={me} busy={!!busy} onAction={action} resourceTypes={RES} resourceMeta={META} />}
        <aside id="match-activity" className="game-sidebar" aria-label="Game activity" hidden={!activityOpen}>
          <div className="match-activity-tabs" role="group" aria-label="Game activity view">
            <button
              className="match-command"
              aria-pressed={sidebar === "activity"}
              onClick={() => setSidebar("activity")}
            >
              <ScrollText size={14} />
              Game log
            </button>
            <button
              className="match-command"
              aria-pressed={sidebar === "chat"}
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
        {drawer && <button type="button" className="match-drawer-shade" tabIndex={-1} aria-label="Close panel" onClick={() => setDrawer(null)} />}
      </div>
      <section className="match-dock" aria-label="Turn controls and cards">
        <div className="action-bar">
          {dev && (
            <DevelopmentTray id={developmentTrayId} key={dev.id} card={dev} game={game} meta={DEV_META[dev.type] || DEV_META.knight}
              restriction={developmentRestriction(dev, game, meId)} busy={!!busy} onClose={closeDevelopment} onPlay={playDevelopment}
              resourceTypes={RES} resourceMeta={META} Face={CardFace} />
          )}
          {game.phase === "steal" && myTurn && (
            <RobberTray players={game.players} targetIds={game.stealTargets} busy={!!busy} onAction={action} />
          )}
          <div className="build-actions" role="group" aria-label="Build and piece inventory">
            {[
              ["road", Route, "Road", me.roadsLeft],
              ["settlement", Home, "Settlement", me.settlementsLeft],
              ["city", Building2, "City", me.citiesLeft],
            ].map(([type, Icon, label, left]) => (
              <button
                key={type}
                type="button"
                className={`build-action ${selectedBuild === type ? "selected" : ""}`}
                aria-label={`${label}, ${left} left`}
                aria-description={costDescription(type)}
                aria-pressed={selectedBuild === type}
                {...shortcutProps(type)}
                disabled={!canBuild[type] || !!busy}
                onClick={() => { setDevId(null); setTrade(false); setMode(selectedBuild === type ? null : type); }}
              >
                <Icon size={19} aria-hidden="true" />
                <span className="build-details">
                  {label}
                  <Cost cost={COSTS[type]} />
                </span>
                <span className="piece-count" aria-hidden="true" data-empty={left === 0} title={`${left} left to place`}>{left}</span>
              </button>
            ))}
            <button type="button"
              className="build-action"
              aria-description={costDescription("development")}
              {...shortcutProps("development")}
              disabled={!canAct || !!busy || !afford("development") || !game.developmentRemaining}
              onClick={() => action("buyDevelopment")}
            >
              <ScrollText size={19} aria-hidden="true" />
              <span className="build-details">
                Develop
                <Cost cost={COSTS.development} />
              </span>
            </button>
          </div>
          <div className="turn-actions">
            <MatchDice dice={game.dice} rollId={rollId} canRoll={canRoll} onRoll={() => action("rollDice")} />
            <button type="button" ref={tradeTrigger} className="match-command turn-command" disabled={!canAct || !!busy}
              aria-expanded={trading} aria-controls={trading ? "match-trade-tray" : undefined}
              onClick={trading ? closeTrade : openTrade}>
              <Handshake size={21} aria-hidden="true" /> Trade
            </button>
            <button type="button" className="match-command turn-command" data-tone="gold" {...shortcutProps("endTurn")} disabled={!canAct || !!busy} onClick={() => action("endTurn")}>
              End turn <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <PendingCardArrivals.Provider value={deals.pending}>
          <ResourceCardDraft tradeOpen={trading} canTrade={canAct} discardCount={discardCount} game={game} me={me} offers={offers}
            busy={!!busy} onOpen={openTrade} onClose={closeTrade} onAction={action} resourceTypes={RES} resourceMeta={META} Face={CardFace}
            renderHand={selection => <MatchHands me={me} game={game} resourceTypes={RES} resourceMeta={META}
              developmentMeta={DEV_META} onInspect={blockingPrompt ? undefined : inspectDevelopment}
              inspected={dev?.id} inspectionId={developmentTrayId} selection={selection} />} />
        </PendingCardArrivals.Provider>
      </section>
      <CardDealLayer scope={matchPage} game={game} me={me} deals={deals} resourceMeta={META} developmentMeta={DEV_META} Face={CardFace} />
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
      <KeyboardShortcuts tableNavigation />
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
