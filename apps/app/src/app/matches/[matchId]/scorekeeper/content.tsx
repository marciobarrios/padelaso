"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Minus, Trash2, Check, RefreshCw, Square } from "lucide-react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useMatch, usePlayers, useAllMatchEvents, invalidate, keys } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import {
  createScoreToken,
  rotateScoreToken,
  revokeScoreToken,
  repointScoreToken,
  deactivateScoreToken,
  fetchUserScoreToken,
  incrementMatchScore,
  addMatchEvent,
} from "@/lib/supabase-mutations";
import { buildPlayerMap, dateFormatter } from "@/lib/utils";
import { getBrowserClient } from "@/lib/supabase";
import { EVENT_CONFIGS } from "@padelaso/domain/events";
import { MatchSet, MatchEventType, ScoreToken } from "@padelaso/domain/types";
import { ShortcutSetupInstructions } from "./shortcut-instructions";

export function ScorekeeperContent({
  matchId,
  pinned,
}: {
  matchId: string;
  pinned: boolean;
}) {
  const { match, loaded: matchLoaded } = useMatch(matchId);

  if (!matchLoaded) {
    return (
      <MobileShell>
        <PageHeader title="Scorekeeper" back />
      </MobileShell>
    );
  }
  if (!match) {
    return (
      <MobileShell>
        <PageHeader title="Scorekeeper" back />
        <p className="text-center py-12 text-muted-foreground">
          Partido no encontrado
        </p>
      </MobileShell>
    );
  }

  if (pinned) {
    return <PinnedScorer matchId={matchId} />;
  }
  return <SetupView matchId={matchId} />;
}

// ============================================================
// Setup view: generate token + show Shortcut instructions
// ============================================================

function SetupView({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const userId = user?.id;
  const { match } = useMatch(matchId);
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const [token, setToken] = useState<ScoreToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let ignore = false;
    fetchUserScoreToken(userId)
      .then((t) => {
        if (!ignore) setToken(t);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [userId]);

  async function createToken() {
    if (!userId) return;
    setBusy(true);
    try {
      const t = await createScoreToken(userId, matchId);
      setToken(t);
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!userId) return;
    if (!window.confirm(
      "El token actual dejará de funcionar. Tendrás que pegar el nuevo en tu atajo. ¿Regenerar token?"
    )) return;
    setBusy(true);
    try {
      const t = await rotateScoreToken(userId);
      setToken(t);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!userId) return;
    if (!window.confirm(
      "Tu atajo dejará de funcionar hasta que crees otro token y lo configures. ¿Revocar token?"
    )) return;
    setBusy(true);
    try {
      await revokeScoreToken(userId);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function pointAtThisMatch() {
    if (!userId) return;
    setBusy(true);
    try {
      const t = await repointScoreToken(userId, matchId);
      if (t) setToken(t);
    } finally {
      setBusy(false);
    }
  }

  async function finishLiveMatch() {
    if (!userId) return;
    setBusy(true);
    try {
      const t = await deactivateScoreToken(userId, matchId);
      setToken(t ?? (await fetchUserScoreToken(userId)));
    } finally {
      setBusy(false);
    }
  }

  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const matchLabel = useMemo(() => {
    if (!match) return "";
    const join = (ids: string[]) =>
      ids.map((id) => playerMap.get(id)?.name ?? "?").join("·");
    return `${join(match.team1)} vs ${join(match.team2)}`;
  }, [match, playerMap]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const scoreUrl = token ? `${origin}/api/score?token=${token.token}` : "";
  const eventsUrl = token ? `${origin}/api/events?token=${token.token}` : "";
  const optionsUrl = token
    ? `${origin}/api/shortcut/options?token=${token.token}`
    : "";

  const tokenStatus: TokenStatus | null = !token
    ? null
    : token.currentMatchId === matchId
      ? "here"
      : token.currentMatchId
        ? "elsewhere"
        : "none";

  return (
    <MobileShell>
      <PageHeader title="Scorekeeper" backHref={`/matches/${matchId}`} />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {match && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Este partido
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-sm truncate">{matchLabel}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {dateFormatter.format(new Date(match.date))}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="font-heading text-lg font-bold">📟 Modo pinned</h2>
            <p className="text-sm text-muted-foreground">
              Coloca el móvil fijo cerca de la pista y pulsa botones grandes
              para sumar puntos. Los espectadores ven los cambios en vivo.
            </p>
            <Link href={`/matches/${matchId}/scorekeeper?pinned=1`}>
              <Button className="w-full">Abrir scorer en pantalla grande</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4 text-sm">
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-bold">
                ⌚ Atajo para Apple Watch
              </h2>
              <p className="text-foreground/80">
                Suma puntos y registra eventos desde el reloj, sin Siri ni
                dictado. Añade el atajo ya preparado y conecta tu token una sola vez.
              </p>
            </div>

            {loading ? (
              <Button disabled className="w-full">
                <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
              </Button>
            ) : !token ? (
              <Button onClick={createToken} disabled={busy} className="min-h-11 w-full">
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Crear token permanente
              </Button>
            ) : (
              <div className="space-y-5">
                {tokenStatus && <TokenStatusBanner status={tokenStatus} />}

                {tokenStatus !== "here" && (
                  <Button
                    variant="outline"
                    onClick={pointAtThisMatch}
                    disabled={busy}
                    className="min-h-11 w-full"
                  >
                    Apuntar a este partido
                  </Button>
                )}

                <ShortcutSetupInstructions
                  token={token.token}
                  scoreUrl={scoreUrl}
                  eventsUrl={eventsUrl}
                  optionsUrl={optionsUrl}
                />

                {tokenStatus === "here" && (
                  <Button
                    variant="outline"
                    onClick={finishLiveMatch}
                    disabled={busy}
                    className="min-h-11 w-full"
                  >
                    <Square className="size-3.5 mr-1.5" />
                    Finalizar partido en directo
                  </Button>
                )}

                <details className="border-t border-border">
                  <summary className="min-h-11 cursor-pointer py-3 text-foreground/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    Gestionar token
                  </summary>
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-foreground/80">
                      No caduca. No hace falta regenerarlo entre partidos.
                      {token.lastUsedAt
                        ? ` Último uso: ${new Date(token.lastUsedAt).toLocaleString("es-ES", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}.`
                        : " Sin uso todavía."}
                    </p>
                    <p className="text-xs text-foreground/80">
                      Si lo regeneras, pega el nuevo token al principio del
                      atajo. Si lo revocas, el atajo dejará de funcionar.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={rotate}
                        disabled={busy}
                        className="min-h-11"
                      >
                        <RefreshCw aria-hidden="true" /> Regenerar token
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={revoke}
                        disabled={busy}
                        className="min-h-11"
                      >
                        <Trash2 aria-hidden="true" /> Revocar token
                      </Button>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MobileShell>
  );
}

type TokenStatus = "here" | "elsewhere" | "none";

const TOKEN_BANNERS: Record<
  TokenStatus,
  { className: string; content: React.ReactNode }
> = {
  here: {
    className:
      "flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300",
    content: (
      <>
        <Check className="size-3.5 shrink-0" />
        Atajo activo para este partido
      </>
    ),
  },
  elsewhere: {
    className:
      "rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200",
    content: (
      <>
        Tu shortcut apunta ahora a otro partido. Pulsa{" "}
        <em>&ldquo;Apuntar a este partido&rdquo;</em> para redirigirlo.
      </>
    ),
  },
  none: {
    className: "rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground",
    content: (
      <>
        Tu shortcut no apunta a ningún partido. Empieza un partido en vivo
        desde el asistente o pulsa <em>&ldquo;Apuntar a este partido&rdquo;</em>.
      </>
    ),
  },
};

function TokenStatusBanner({ status }: { status: TokenStatus }) {
  const { className, content } = TOKEN_BANNERS[status];
  return <div className={className}>{content}</div>;
}

// ============================================================
// Pinned scorer: big buttons, wake lock, live state
// ============================================================

function PinnedScorer({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { match } = useMatch(matchId);
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const [busy, setBusy] = useState(false);
  // Optimistic override: seeded from RPC responses so the UI reflects the
  // new score immediately. Cleared whenever the fetched match.sets changes,
  // so the server stays source of truth after Realtime/refresh round-trips.
  const [optimisticSets, setOptimisticSets] = useState<MatchSet[] | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Wake Lock: auto-released whenever the document hides (tab switch,
  // incoming call, screen off). Re-request on visibilitychange so the
  // screen stays on across interruptions.
  useEffect(() => {
    async function acquire() {
      try {
        if (
          "wakeLock" in navigator &&
          document.visibilityState === "visible" &&
          !wakeLockRef.current
        ) {
          const lock = await navigator.wakeLock.request("screen");
          wakeLockRef.current = lock;
          lock.addEventListener("release", () => {
            if (wakeLockRef.current === lock) wakeLockRef.current = null;
          });
        }
      } catch {
        // Non-critical; OS / browser may deny under low battery etc.
      }
    }
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // Realtime: score can change from another device (Siri Shortcut, another
  // tab). Subscribe to UPDATE on this match row so the pinned view stays
  // in sync without manual refresh.
  useEffect(() => {
    const client = getBrowserClient();
    let channel: ReturnType<typeof client.channel> | null = null;

    function open() {
      if (channel) return;
      channel = client
        .channel(`pinned:${matchId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "matches",
            filter: `id=eq.${matchId}`,
          },
          () => invalidate(keys.match(matchId))
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          console.warn("[pinned realtime]", status, err);
        });
    }
    function close() {
      if (!channel) return;
      channel.unsubscribe();
      channel = null;
    }

    open();
    // iOS Safari suspends websockets when the page is backgrounded (Siri
    // activation, screen lock). Tear down + reopen on visible so a dead
    // socket gets replaced; invalidate makes the data current immediately.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      close();
      open();
      invalidate(keys.match(matchId));
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [matchId]);

  // Reconcile optimistic state back to the server's view whenever the
  // fetched match changes.
  useEffect(() => {
    if (match?.sets) setOptimisticSets(null);
  }, [match?.sets]);

  const playerMap = buildPlayerMap(players);

  if (!match) return null;

  const effectiveSets: MatchSet[] =
    optimisticSets ??
    (match.sets.length ? match.sets : [{ team1Score: 0, team2Score: 0 }]);
  const currentSet = effectiveSets[effectiveSets.length - 1];

  async function adjust(team: 1 | 2, delta: number) {
    if (!match || busy) return;
    setBusy(true);
    try {
      const updated = await incrementMatchScore(match.id, team, delta);
      setOptimisticSets(updated);
      invalidate(keys.match(matchId));
    } finally {
      setBusy(false);
    }
  }

  async function addSet() {
    if (!match || busy) return;
    setBusy(true);
    try {
      // Append an empty set by passing newSet=true with a no-op delta.
      const updated = await incrementMatchScore(match.id, 1, 0, true);
      setOptimisticSets(updated);
      invalidate(keys.match(matchId));
    } finally {
      setBusy(false);
    }
  }

  const team1Players = match.team1.map((id) => playerMap.get(id));
  const team2Players = match.team2.map((id) => playerMap.get(id));

  return (
    <div className="fixed inset-0 bg-background flex flex-col select-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">
          Set {effectiveSets.length}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={addSet} disabled={busy}>
            + Set
          </Button>
          <Button
            size="sm"
            onClick={() => router.replace(`/matches/${matchId}`)}
          >
            Listo
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-1 p-1">
        <TeamPanel
          color="blue"
          players={team1Players.filter(Boolean).map((p) => ({
            emoji: p!.emoji,
            name: p!.name,
          }))}
          score={currentSet.team1Score}
          busy={busy}
          onIncrement={() => adjust(1, 1)}
          onDecrement={() => adjust(1, -1)}
        />
        <TeamPanel
          color="rose"
          players={team2Players.filter(Boolean).map((p) => ({
            emoji: p!.emoji,
            name: p!.name,
          }))}
          score={currentSet.team2Score}
          busy={busy}
          onIncrement={() => adjust(2, 1)}
          onDecrement={() => adjust(2, -1)}
        />
      </div>

      <div className="border-t border-border px-4 py-2 flex items-center justify-center gap-3 text-sm text-muted-foreground tabular-nums">
        {effectiveSets.map((s, i) => (
          <span key={i}>
            {s.team1Score}-{s.team2Score}
          </span>
        ))}
      </div>

      <QuickEventRow matchId={matchId} />
    </div>
  );
}

function TeamPanel({
  color,
  players,
  score,
  busy,
  onIncrement,
  onDecrement,
}: {
  color: "blue" | "rose";
  players: { emoji: string; name: string }[];
  score: number;
  busy: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const tint =
    color === "blue"
      ? "bg-blue-500/10 text-blue-600 dark:text-blue-300"
      : "bg-rose-500/10 text-rose-600 dark:text-rose-300";

  return (
    <div className={`relative flex flex-col rounded-xl ${tint}`}>
      <div className="flex items-center gap-1.5 p-3 text-sm font-medium">
        {players.map((p, i) => (
          <PlayerAvatar key={i} emoji={p.emoji} name={p.name} size="sm" />
        ))}
        <span className="truncate">
          {players.map((p) => p.name).join(" · ")}
        </span>
      </div>
      <button
        onClick={onIncrement}
        disabled={busy}
        className="flex-1 flex items-center justify-center text-8xl font-heading font-black tabular-nums active:scale-95 transition-transform disabled:opacity-50"
        aria-label="Sumar punto"
      >
        {score}
      </button>
      <div className="flex items-center justify-end gap-1 p-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onDecrement}
          disabled={busy || score === 0}
          aria-label="Restar punto"
        >
          <Minus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onIncrement}
          disabled={busy}
          aria-label="Sumar punto"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Quick events row at the bottom of pinned mode
// ============================================================

function QuickEventRow({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const { match } = useMatch(matchId);
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const { events: groupEvents } = useAllMatchEvents(activeGroup?.id);
  const [selecting, setSelecting] = useState<MatchEventType | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const lastAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
  }, []);

  // All events, sorted by global usage in this group. Never-used events
  // keep their original config order as a stable tie-breaker, so the row
  // stays predictable until real data accumulates.
  const sortedEvents = useMemo(() => {
    const count = new Map<MatchEventType, number>();
    for (const e of groupEvents) {
      count.set(e.type, (count.get(e.type) ?? 0) + 1);
    }
    return EVENT_CONFIGS.map((config, i) => ({
      ...config,
      count: count.get(config.type) ?? 0,
      originalIndex: i,
    })).sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.originalIndex - b.originalIndex
    );
  }, [groupEvents]);

  const matchPlayers = useMemo(() => {
    if (!match) return [];
    const map = buildPlayerMap(players);
    return [...match.team1, ...match.team2]
      .map((id) => map.get(id))
      .filter(Boolean) as typeof players;
  }, [match, players]);

  async function handleSelect(type: MatchEventType, playerId: string) {
    if (!user) return;
    await addMatchEvent(matchId, playerId, type, user.id);
    invalidate(keys.matchEvents(matchId));
    if (activeGroup?.id) invalidate(keys.allMatchEvents(activeGroup.id));
    setLastAdded(type);
    setSelecting(null);
    if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
    lastAddedTimerRef.current = setTimeout(() => setLastAdded(null), 1200);
  }

  return (
    <div className="border-t border-border p-2">
      {selecting ? (
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-muted-foreground px-1">¿Quién?</span>
          {matchPlayers.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              onClick={() => handleSelect(selecting, p.id)}
            >
              <span className="mr-1">{p.emoji}</span> {p.name}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelecting(null)}
          >
            ✕
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto">
          {sortedEvents.map((e) => (
            <Button
              key={e.type}
              variant={lastAdded === e.type ? "default" : "outline"}
              size="sm"
              onClick={() => setSelecting(e.type)}
              className="shrink-0"
            >
              <span className="mr-1">{e.emoji}</span>
              <span className="text-xs whitespace-nowrap">{e.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
