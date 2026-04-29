"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Minus, Trash2, Check, RefreshCw } from "lucide-react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useMatch, usePlayers, useDataRefresh, useAllMatchEvents } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import {
  createScoreToken,
  rotateScoreToken,
  revokeScoreToken,
  repointScoreToken,
  fetchUserScoreToken,
  incrementMatchScore,
  addMatchEvent,
} from "@/lib/supabase-mutations";
import { buildPlayerMap, dateFormatter } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import { EVENT_CONFIGS } from "@/lib/event-config";
import { MatchSet, MatchEventType, ScoreToken } from "@/lib/types";

export function ScorekeeperContent({
  matchId,
  pinned,
}: {
  matchId: string;
  pinned: boolean;
}) {
  const { user } = useAuth();
  const { match, loaded: matchLoaded } = useMatch(matchId);
  const isCreator = Boolean(user && match && match.createdBy === user.id);

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
  if (!isCreator) {
    return (
      <MobileShell>
        <PageHeader title="Scorekeeper" back />
        <p className="text-center py-12 text-muted-foreground px-6">
          Sólo quien creó el partido puede abrir el scorekeeper.
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
                ⌚ Atajos de Siri (Apple Watch)
              </h2>
              <p className="text-muted-foreground">
                Monta los atajos en iOS una sola vez. La URL no cambia entre
                partidos: cada nuevo partido en vivo apunta el atajo
                automáticamente al marcador correcto.
              </p>
            </div>

            {loading ? (
              <Button disabled className="w-full">
                <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
              </Button>
            ) : !token ? (
              <Button onClick={createToken} disabled={busy} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Crear token (válido 30 días)
              </Button>
            ) : (
              <div className="space-y-5">
                {tokenStatus && <TokenStatusBanner status={tokenStatus} />}

                <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border pb-3">
                  <span>
                    Caduca:{" "}
                    {new Date(token.expiresAt).toLocaleString("es-ES", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={rotate}
                      disabled={busy}
                    >
                      <RefreshCw className="size-3.5 mr-1" /> Rotar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={revoke}
                      disabled={busy}
                    >
                      <Trash2 className="size-3.5 mr-1" /> Revocar
                    </Button>
                  </div>
                </div>

                {tokenStatus !== "here" && (
                  <Button
                    variant="outline"
                    onClick={pointAtThisMatch}
                    disabled={busy}
                    className="w-full"
                  >
                    Apuntar a este partido
                  </Button>
                )}

                <section className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Receta base (sólo la primera vez)
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground marker:text-foreground/60">
                    <li>
                      iPhone → <strong>Atajos</strong> → <strong>+</strong>{" "}
                      nuevo → acción{" "}
                      <strong>Obtener contenidos de URL</strong>.
                    </li>
                    <li>Pega la URL del atajo correspondiente (abajo).</li>
                    <li>
                      Toca <strong>Mostrar más</strong> y deja:{" "}
                      <code>Método</code> = <code>POST</code>;{" "}
                      <code>Cabeceras</code> → <code>Content-Type</code> ={" "}
                      <code>application/json</code>;{" "}
                      <code>Cuerpo de la solicitud</code> tipo <em>JSON</em>,
                      con los campos que indica cada atajo.
                    </li>
                    <li>
                      Renómbralo y activa <strong>Añadir a Siri</strong> con
                      esa misma frase.
                    </li>
                  </ol>
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    1 · Punto equipo uno
                  </p>
                  <UrlBlock url={scoreUrl} />
                  <p className="text-xs text-muted-foreground">
                    Cuerpo JSON: <code>team</code> = <code>1</code> (Número).
                    Frase Siri: <em>&ldquo;Punto equipo uno&rdquo;</em>.
                  </p>
                </section>

                <section className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    2 · Punto equipo dos
                  </p>
                  <p className="text-muted-foreground">
                    Mantén pulsado el atajo 1 → <strong>Duplicar</strong>. En
                    la copia cambia <code>team</code> a <code>2</code>,
                    renómbralo <em>&ldquo;Punto equipo dos&rdquo;</em> y
                    vuelve a activar Siri.
                  </p>
                </section>

                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground select-none">
                    3 · Registrar evento (opcional)
                  </summary>
                  <div className="space-y-2 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Para gritarle <em>&ldquo;víbora Marcio&rdquo;</em> a
                      Siri. Misma receta, otra URL y dos campos en el cuerpo:
                    </p>
                    <UrlBlock url={eventsUrl} />
                    <p className="text-xs text-muted-foreground">
                      Cuerpo JSON: <code>playerId</code> = UUID del jugador
                      (en su URL al abrir el perfil, después de{" "}
                      <code>/players/</code>); <code>type</code> = nombre del
                      evento (<code>vibora</code>, <code>ace</code>,{" "}
                      <code>bandeja</code>, <code>bola_fuera</code>…).
                    </p>
                  </div>
                </details>

                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  <strong>Extras opcionales</strong>: en el cuerpo JSON,{" "}
                  <code>delta = -1</code> deshace un punto y{" "}
                  <code>newSet = true</code> abre un set nuevo.
                </p>
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
        Apuntando a este partido
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

function UrlBlock({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <pre className="p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap break-all">
        {url}
      </pre>
      <Button size="sm" onClick={copy} className="w-full">
        {copied ? (
          <>
            <Check className="size-3.5 mr-1.5" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-3.5 mr-1.5" /> Copiar URL
          </>
        )}
      </Button>
    </div>
  );
}

// ============================================================
// Pinned scorer: big buttons, wake lock, live state
// ============================================================

function PinnedScorer({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { match } = useMatch(matchId);
  const { activeGroup } = useGroup();
  const { players } = usePlayers(activeGroup?.id);
  const { refresh } = useDataRefresh();
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
    const client = createClient();
    const channel = client
      .channel(`pinned:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [matchId, refresh]);

  // Reconcile optimistic state back to the server's view whenever the
  // fetched match changes.
  useEffect(() => {
    if (match?.sets) setOptimisticSets(null);
  }, [match?.sets]);

  const playerMap = useMemo(() => buildPlayerMap(players), [players]);

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
      refresh();
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
      refresh();
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
  const { refresh } = useDataRefresh();
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
    refresh();
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
