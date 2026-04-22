"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Minus, Trash2, Check } from "lucide-react";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { useMatch, usePlayers, useDataRefresh } from "@/lib/db-hooks";
import { useGroup } from "@/components/group/group-provider";
import {
  createMatchScoreToken,
  revokeMatchScoreToken,
  fetchActiveMatchScoreToken,
  updateMatch,
  addMatchEvent,
  type MatchScoreToken,
} from "@/lib/supabase-mutations";
import { applyScoreDelta, buildPlayerMap } from "@/lib/utils";
import { EVENT_MAP } from "@/lib/event-config";
import { MatchSet, MatchEventType } from "@/lib/types";

const QUICK_EVENT_TYPES: MatchEventType[] = [
  "ace",
  "vibora",
  "bandeja",
  "bola_fuera",
  "puntazo",
  "doble_falta",
];

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
  const [token, setToken] = useState<MatchScoreToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetchActiveMatchScoreToken(matchId)
      .then((t) => {
        if (!ignore) setToken(t);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [matchId]);

  async function createToken() {
    if (!user) return;
    setBusy(true);
    try {
      const t = await createMatchScoreToken(matchId, user.id);
      setToken(t);
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken() {
    if (!token) return;
    setBusy(true);
    try {
      await revokeMatchScoreToken(token.token);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const scoreUrl = token
    ? `${origin}/api/matches/${matchId}/score?token=${token.token}`
    : "";
  const eventsUrl = token
    ? `${origin}/api/matches/${matchId}/events?token=${token.token}`
    : "";

  return (
    <MobileShell>
      <PageHeader title="Scorekeeper" back />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
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
          <CardContent className="p-5 space-y-3">
            <h2 className="font-heading text-lg font-bold">⌚ Apple Watch (vía Siri)</h2>
            <p className="text-sm text-muted-foreground">
              Crea un token efímero (4h) y pégalo en una{" "}
              <em>Shortcut</em> de iOS. Luego di <em>&ldquo;Oye Siri, punto
              equipo uno&rdquo;</em> desde el Watch.
            </p>

            {loading ? (
              <Button disabled className="w-full">
                <Loader2 className="size-4 animate-spin mr-2" /> Cargando…
              </Button>
            ) : token ? (
              <div className="space-y-3">
                <TokenBlock label="Sumar punto" url={scoreUrl} body='{"team":1}' />
                <TokenBlock
                  label="Registrar evento"
                  url={eventsUrl}
                  body='{"playerId":"<UUID>","type":"vibora"}'
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Caduca:{" "}
                    {new Date(token.expiresAt).toLocaleString("es-ES", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={revokeToken}
                    disabled={busy}
                  >
                    <Trash2 className="size-3.5 mr-1" /> Revocar
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={createToken} disabled={busy} className="w-full">
                {busy ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                Crear token (4 horas)
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <h2 className="font-heading text-lg font-bold">📋 Cómo montar la Shortcut</h2>
            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
              <li>Abre la app <strong>Atajos</strong> en tu iPhone.</li>
              <li>
                Crea una nueva shortcut → acción{" "}
                <strong>Obtener contenidos de URL</strong>.
              </li>
              <li>Pega la URL &ldquo;Sumar punto&rdquo; de arriba.</li>
              <li>
                Método: <strong>POST</strong>. Cabecera{" "}
                <code>Content-Type: application/json</code>. Cuerpo (JSON):
                <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto">
                  {`{"team":1}`}
                </pre>
                (usa <code>2</code> para el otro equipo).
              </li>
              <li>
                Ponle nombre: <em>&ldquo;Punto equipo uno&rdquo;</em>. Activa{" "}
                <strong>Añadir a Siri</strong>.
              </li>
              <li>
                Desde tu Apple Watch di <em>&ldquo;Oye Siri, punto equipo
                uno&rdquo;</em>. El resultado se actualiza en vivo para todos.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground pt-2">
              Atajo extra: <code>{"{\"team\":1,\"newSet\":true}"}</code> abre un
              nuevo set. <code>{"{\"team\":1,\"delta\":-1}"}</code> deshace un
              punto.
            </p>
          </CardContent>
        </Card>
      </div>
    </MobileShell>
  );
}

function TokenBlock({
  label,
  url,
  body,
}: {
  label: string;
  url: string;
  body: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sample = `curl -X POST '${url}' -H 'Content-Type: application/json' -d '${body}'`;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(sample);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <pre className="p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap break-all">
        {sample}
      </pre>
      <Button
        variant="outline"
        size="sm"
        onClick={copy}
        className="w-full"
      >
        {copied ? (
          <>
            <Check className="size-3.5 mr-1.5" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-3.5 mr-1.5" /> Copiar curl
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
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function acquire() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Screen stays on only as long as the OS agrees; not critical if it fails.
      }
    }
    acquire();
    return () => {
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const playerMap = useMemo(() => buildPlayerMap(players), [players]);

  if (!match) return null;

  const sets: MatchSet[] = match.sets.length
    ? match.sets
    : [{ team1Score: 0, team2Score: 0 }];
  const currentSet = sets[sets.length - 1];

  async function adjust(team: 1 | 2, delta: number) {
    if (!match) return;
    setBusy(true);
    try {
      await updateMatch(match.id, { sets: applyScoreDelta(sets, team, delta) });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addSet() {
    if (!match) return;
    setBusy(true);
    try {
      await updateMatch(match.id, {
        sets: [...sets, { team1Score: 0, team2Score: 0 }],
      });
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/matches/${matchId}/scorekeeper`)}
        >
          Salir
        </Button>
        <span className="text-xs text-muted-foreground font-medium">
          Set {sets.length} — pantalla activa
        </span>
        <Button variant="ghost" size="sm" onClick={addSet} disabled={busy}>
          + Set
        </Button>
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
        {sets.map((s, i) => (
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
  const { refresh } = useDataRefresh();
  const [selecting, setSelecting] = useState<MatchEventType | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const lastAddedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current);
  }, []);

  const quickEvents = useMemo(
    () => QUICK_EVENT_TYPES.map((type) => EVENT_MAP.get(type)!),
    []
  );

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
          {quickEvents.map((e) => (
            <Button
              key={e.type}
              variant={lastAdded === e.type ? "default" : "outline"}
              size="sm"
              onClick={() => setSelecting(e.type)}
            >
              <span className="mr-1">{e.emoji}</span>
              <span className="text-xs">{e.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
