"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getFreshAccessToken } from "@/lib/api";
import { getWsBaseUrl } from "@/lib/utils";
import type {
  BattleEvent,
  BattleSnapshot,
  DraftSnapshot,
  FinishInfo,
  GameStage,
  LoggedEvent,
  PlayerInfo,
  ResultData,
  ServerStage,
  Side,
  TurnClock,
  TurnTimerPayload,
} from "@/app/components/game/types";

interface UseMatchSocketArgs {
  userId: string | undefined;
  onFinished?: () => void;
}

interface UseMatchSocketReturn {
  gameState: GameStage;
  searchTime: number;
  mySide: Side | null;
  leftPlayer: PlayerInfo | null;
  rightPlayer: PlayerInfo | null;
  draft: DraftSnapshot | null;
  battle: BattleSnapshot | null;
  myResult: ResultData | null;
  opponentResult: ResultData | null;
  opponentDisconnected: boolean;
  // Transient "this passive just fired" pulses, keyed by unit_id. `key` bumps
  // on every fresh proc so the UI can restart its flash animation.
  procPulses: Record<string, { name: string; key: number }>;
  // What the opponent is currently doing (or null when idle). Surfaced as a
  // live "intent" banner so you can anticipate their next move.
  opponentIntent: OpponentIntent | null;
  // Append-only feed of recent actions (attack/ability/passive) to telegraph.
  telegraphs: TelegraphEvent[];
  // Whose-turn clock (draft and battle); null when nothing is ticking.
  turnClock: TurnClock | null;
  // Full battle log for this match, and the batch that arrived with the
  // latest snapshot (drives movement animations).
  battleLog: LoggedEvent[];
  eventBatch: { key: number; events: BattleEvent[] } | null;
  // How the finished match ended (reason, winner, per-hero stats).
  finishInfo: FinishInfo | null;
  isConnected: boolean;
  startSearch: () => void;
  cancelSearch: () => void;
  banCharacter: (charId: string) => void;
  pickCharacter: (charId: string) => void;
  activateUnit: (unitId: string) => void;
  moveActiveUnit: (targetZone: number) => void;
  attackTarget: (targetUnitId: string) => void;
  useAbility: (target: { abilityId?: string; unitId?: string; unitId2?: string; zone?: number }) => void;
  endTurn: () => void;
  surrender: () => void;
  returnHome: () => void;
  // Tell the server what you're currently doing (relayed to the opponent).
  // Pass null when you stop / go idle.
  sendIntent: (intent: OpponentIntent | null) => void;
}

// A live, cosmetic "what is the opponent doing right now" hint.
// - inspect:   reading a hero's kit (unitId of the inspected unit)
// - targeting: choosing a target for an attack/ability (abilityName = label)
// - hover:     pointing at an ability they haven't committed to yet
// - move:      choosing where to move
export interface OpponentIntent {
  kind: "inspect" | "targeting" | "hover" | "move";
  unitId?: string | null;
  abilityName?: string | null;
}

export interface TelegraphEvent {
  key: number;
  unitId: string;
  kind: "attack" | "ability" | "passive";
  refId?: string; // ability id or passive id
  name?: string;
}

const RECONNECT_DELAY_MS = 2000;

type TaggedWebSocket = WebSocket & { __intentional?: boolean };

function markIntentional(ws: WebSocket | null) {
  if (ws) (ws as TaggedWebSocket).__intentional = true;
}

function serverStageToClient(s: ServerStage): GameStage {
  if (s === "DRAFT_BAN" || s === "DRAFT_PICK") return "DRAFT";
  return s;
}

export function useMatchSocket({ userId, onFinished }: UseMatchSocketArgs): UseMatchSocketReturn {
  const [gameState, setGameState] = useState<GameStage>("IDLE");
  const [searchTime, setSearchTime] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const [leftPlayer, setLeftPlayer] = useState<PlayerInfo | null>(null);
  const [rightPlayer, setRightPlayer] = useState<PlayerInfo | null>(null);
  const [mySide, setMySide] = useState<Side | null>(null);

  const [draft, setDraft] = useState<DraftSnapshot | null>(null);
  const [battle, setBattle] = useState<BattleSnapshot | null>(null);

  const [myResult, setMyResult] = useState<ResultData | null>(null);
  const [opponentResult, setOpponentResult] = useState<ResultData | null>(null);

  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [procPulses, setProcPulses] = useState<Record<string, { name: string; key: number }>>({});
  const procKeyRef = useRef(0);
  const [opponentIntent, setOpponentIntent] = useState<OpponentIntent | null>(null);
  const [telegraphs, setTelegraphs] = useState<TelegraphEvent[]>([]);
  const fxKeyRef = useRef(0);
  const [turnClock, setTurnClock] = useState<TurnClock | null>(null);
  const [battleLog, setBattleLog] = useState<LoggedEvent[]>([]);
  const [eventBatch, setEventBatch] = useState<{ key: number; events: BattleEvent[] } | null>(null);
  const logKeyRef = useRef(0);
  const [finishInfo, setFinishInfo] = useState<FinishInfo | null>(null);

  const wsRef = useRef<TaggedWebSocket | null>(null);
  // True while the hook is mounted with a user; guards connects that resolve
  // (after an async token refresh) once the component has gone away.
  const mountedRef = useRef(false);
  const connectingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  // Search timer
  useEffect(() => {
    if (gameState === "SEARCHING") {
      searchTimerRef.current = setInterval(() => setSearchTime((t) => t + 1), 1000);
    } else {
      if (searchTimerRef.current) {
        clearInterval(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      setSearchTime(0);
    }
    return () => {
      if (searchTimerRef.current) clearInterval(searchTimerRef.current);
    };
  }, [gameState]);

  // Leave-confirmation prompt during an active match
  useEffect(() => {
    const inActiveGame = gameState === "DRAFT" || gameState === "BATTLE";
    if (!inActiveGame) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "У вас активная игра. Если вы выйдете, она будет засчитана как поражение.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [gameState]);

  // Apply a server room-state snapshot to local state. Used for both
  // ROOM_STATE (incremental update) and RECONNECT (replay on connect).
  const applyRoomState = useCallback((msg: any) => {
    if (msg.players) {
      setLeftPlayer(msg.players.LEFT ?? null);
      setRightPlayer(msg.players.RIGHT ?? null);
      const uid = userIdRef.current;
      setMySide(msg.players.LEFT?.user_id === uid ? "LEFT" : "RIGHT");
    }
    setGameState(serverStageToClient(msg.stage as ServerStage));
    setDraft(msg.draft ?? null);
    setBattle(msg.battle ?? null);
    // The server sends time *remaining* (its clock isn't ours); anchor it to
    // the local clock on arrival.
    const timer = msg.turn_timer as TurnTimerPayload | null | undefined;
    setTurnClock(timer ? { deadline: Date.now() + timer.remaining_ms, seconds: timer.seconds } : null);
    const events = (msg.events ?? []) as BattleEvent[];
    if (events.length) {
      setEventBatch({ key: ++logKeyRef.current, events });
      setBattleLog((prev) =>
        [...prev, ...events.map((event) => ({ key: ++logKeyRef.current, event }))].slice(-300),
      );
    }
    if (msg.stage !== "FINISHED") {
      // Stale FINISHED results stay rendered until the user dismisses.
      setOpponentDisconnected(false);
    }
  }, []);

  const handleMessage = useCallback(
    (msg: any) => {
      switch (msg.type) {
        case "LOBBY":
          setGameState((prev) => (prev === "FINISHED" ? "FINISHED" : "IDLE"));
          break;
        case "SEARCHING":
          setGameState("SEARCHING");
          break;
        case "SEARCH_CANCELLED":
          setGameState("IDLE");
          break;
        case "GAME_FOUND":
          // GAME_FOUND announces the match; the room-state snapshot follows.
          // Fill player identity early so the searching overlay can dismiss.
          if (msg.players) {
            const uid = userIdRef.current;
            setLeftPlayer(msg.players.LEFT ?? null);
            setRightPlayer(msg.players.RIGHT ?? null);
            setMySide(msg.players.LEFT?.user_id === uid ? "LEFT" : "RIGHT");
          }
          setGameState(serverStageToClient(msg.stage as ServerStage));
          setBattleLog([]);
          setEventBatch(null);
          setFinishInfo(null);
          break;
        case "ROOM_STATE":
          applyRoomState(msg);
          break;
        case "PASSIVE_PROC": {
          const procs: { unit_id: string; id?: string; name: string }[] = msg.procs ?? [];
          if (procs.length) {
            setProcPulses((prev) => {
              const next = { ...prev };
              for (const p of procs) {
                next[p.unit_id] = { name: p.name, key: ++procKeyRef.current };
              }
              return next;
            });
            setTelegraphs((prev) => {
              const add = procs.map((p) => ({
                key: ++fxKeyRef.current,
                unitId: p.unit_id,
                kind: "passive" as const,
                refId: p.id,
                name: p.name,
              }));
              return [...prev, ...add].slice(-16);
            });
          }
          break;
        }
        case "ACTION_FX": {
          if (msg.unit_id) {
            setTelegraphs((prev) =>
              [
                ...prev,
                {
                  key: ++fxKeyRef.current,
                  unitId: msg.unit_id as string,
                  kind: msg.kind as "attack" | "ability",
                  refId: msg.ability_id as string | undefined,
                },
              ].slice(-16),
            );
          }
          break;
        }
        case "OPPONENT_INTENT":
          setOpponentIntent(
            msg.intent
              ? {
                  kind: msg.intent as OpponentIntent["kind"],
                  unitId: (msg.unit_id as string | null) ?? null,
                  abilityName: (msg.ability_name as string | null) ?? null,
                }
              : null,
          );
          break;
        case "RECONNECT":
          applyRoomState(msg);
          toast.info("Подключение к активному матчу восстановлено.", {
            id: "match-reconnect",
          });
          break;
        case "OPPONENT_DISCONNECTED":
          setOpponentDisconnected(true);
          toast.warning(
            `Соперник отключился. У него есть ${msg.grace_seconds ?? 30} сек. на возвращение.`,
            { id: "opponent-disconnected" },
          );
          break;
        case "OPPONENT_RECONNECTED":
          setOpponentDisconnected(false);
          toast.success("Соперник снова в игре.", { id: "opponent-reconnected" });
          break;
        case "GAME_FINISHED": {
          setGameState("FINISHED");
          setTurnClock(null);
          setFinishInfo({
            reason: msg.reason ?? "score",
            winner: msg.winner ?? null,
            summary: msg.summary ?? { rounds: 0, units: [] },
          });
          const uid = userIdRef.current;
          const computedMySide: Side =
            msg.players?.LEFT?.user_id === uid ? "LEFT" : "RIGHT";
          if (computedMySide === "LEFT") {
            setMyResult(msg.results.LEFT);
            setOpponentResult(msg.results.RIGHT);
          } else {
            setMyResult(msg.results.RIGHT);
            setOpponentResult(msg.results.LEFT);
          }
          setOpponentDisconnected(false);
          onFinishedRef.current?.();
          break;
        }
      }
    },
    [applyRoomState],
  );

  const connect = useCallback(async () => {
    if (!userIdRef.current || !mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    if (connectingRef.current) return;

    // The socket authenticates once, at connect time. A reconnect after a
    // network drop can happen long after login, so refresh an expired access
    // token first — otherwise the server rejects it and the match is forfeited.
    connectingRef.current = true;
    let token: string | null;
    try {
      token = await getFreshAccessToken();
    } catch {
      // Network hiccup while refreshing: try with what we have; onclose retries.
      token = localStorage.getItem("token");
    } finally {
      connectingRef.current = false;
    }
    if (!mountedRef.current || !userIdRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    if (!token) {
      toast.error("Сессия истекла. Войдите снова.", { id: "session-expired" });
      return;
    }

    const wsUrl = getWsBaseUrl();
    const ws = new WebSocket(`${wsUrl}/match?token=${token}`) as TaggedWebSocket;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch {
        // ignore malformed payloads
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        setIsConnected(false);
      }

      if (ws.__intentional === true) return;

      if (event.code === 4000) {
        toast.error("Соединение закрыто: открыта новая вкладка игры.", {
          id: "connection-replaced",
        });
        return;
      }
      if (event.code === 4001) {
        toast.error("Ошибка авторизации.", { id: "connection-unauthorized" });
        return;
      }

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    wsRef.current = ws;
  }, [handleMessage]);

  useEffect(() => {
    if (!userId) return;
    mountedRef.current = true;
    void connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        markIntentional(ws);
        wsRef.current = null;
        if (ws.readyState <= WebSocket.OPEN) {
          ws.close(1000, "client unmount");
        }
      }
    };
  }, [userId, connect]);

  const send = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const startSearch = useCallback(() => {
    if (!send({ type: "FIND_MATCH" })) {
      toast.error("Нет соединения с сервером. Попробуйте через секунду.");
      void connect();
      return;
    }
    toast.info("Поиск рейтинговой игры начат.");
  }, [send, connect]);

  const cancelSearch = useCallback(() => {
    send({ type: "CANCEL_SEARCH" });
    toast.warning("Поиск игры отменен.");
  }, [send]);

  const banCharacter = useCallback(
    (charId: string) => {
      send({ type: "BAN_CHARACTER", char_id: charId });
    },
    [send],
  );

  const pickCharacter = useCallback(
    (charId: string) => {
      send({ type: "PICK_CHARACTER", char_id: charId });
    },
    [send],
  );

  const activateUnit = useCallback(
    (unitId: string) => {
      send({ type: "ACTIVATE_UNIT", unit_id: unitId });
    },
    [send],
  );

  const moveActiveUnit = useCallback(
    (targetZone: number) => {
      send({ type: "MOVE", target_zone: targetZone });
    },
    [send],
  );

  const attackTarget = useCallback(
    (targetUnitId: string) => {
      send({ type: "ATTACK", target_unit_id: targetUnitId });
    },
    [send],
  );

  const useAbility = useCallback(
    (target: { abilityId?: string; unitId?: string; unitId2?: string; zone?: number }) => {
      const payload: Record<string, unknown> = { type: "USE_ABILITY" };
      if (target.abilityId) payload.ability_id = target.abilityId;
      if (target.unitId) payload.target_unit_id = target.unitId;
      if (target.unitId2) payload.target_unit_id2 = target.unitId2;
      if (typeof target.zone === "number") payload.target_zone = target.zone;
      send(payload);
    },
    [send],
  );

  const endTurn = useCallback(() => {
    send({ type: "END_TURN" });
  }, [send]);

  const surrender = useCallback(() => {
    send({ type: "SURRENDER" });
  }, [send]);

  const sendIntent = useCallback(
    (intent: OpponentIntent | null) => {
      send({
        type: "INTENT",
        intent: intent?.kind ?? null,
        unit_id: intent?.unitId ?? null,
        ability_name: intent?.abilityName ?? null,
      });
    },
    [send],
  );

  const returnHome = useCallback(() => {
    setGameState("IDLE");
    setLeftPlayer(null);
    setRightPlayer(null);
    setMySide(null);
    setDraft(null);
    setBattle(null);
    setMyResult(null);
    setOpponentResult(null);
    setOpponentDisconnected(false);
    setOpponentIntent(null);
    setTelegraphs([]);
    setTurnClock(null);
    setBattleLog([]);
    setEventBatch(null);
    setFinishInfo(null);
  }, []);

  return {
    gameState,
    searchTime,
    mySide,
    leftPlayer,
    rightPlayer,
    draft,
    battle,
    myResult,
    opponentResult,
    opponentDisconnected,
    procPulses,
    opponentIntent,
    telegraphs,
    turnClock,
    battleLog,
    eventBatch,
    finishInfo,
    isConnected,
    startSearch,
    cancelSearch,
    banCharacter,
    pickCharacter,
    activateUnit,
    moveActiveUnit,
    attackTarget,
    useAbility,
    endTurn,
    surrender,
    returnHome,
    sendIntent,
  };
}
