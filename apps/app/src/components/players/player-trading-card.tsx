import { calculatePlayerCardStats } from "@padelaso/domain/player-card";
import type { Match, MatchEvent, Player } from "@padelaso/domain/types";

interface PlayerTradingCardProps {
  player: Player;
  matches: Match[];
  events: MatchEvent[];
  period?: string;
}

export function PlayerTradingCard({
  player,
  matches,
  events,
  period = "Todo el historial",
}: PlayerTradingCardProps) {
  const { results, aciertos, fallos, espectaculo, signature } =
    calculatePlayerCardStats(player.id, matches, events);
  const streak = results.currentStreak;
  const streakResult = streak > 0 ? "victoria" : "derrota";
  const streakLabel = streak === 0
    ? "Sin racha"
    : `${Math.abs(streak)} ${streakResult}${Math.abs(streak) === 1 ? "" : "s"}`;
  const attributes = [
    { label: "Aciertos", emoji: "🎯", value: aciertos },
    { label: "Fallos", emoji: "🫠", value: fallos },
    { label: "Espectáculo", emoji: "✨", value: espectaculo },
  ];

  return (
    <article
      aria-label={`Cromo de ${player.name}`}
      className="mx-auto w-full max-w-sm rounded-2xl border-4 border-primary bg-card p-2 text-card-foreground shadow-lg"
    >
      <div className="overflow-hidden rounded-lg border border-primary/40">
        <div className="flex items-center justify-between gap-3 bg-primary/10 px-4 py-3">
          <h2 className="min-w-0 break-words text-lg font-bold">{player.name}</h2>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">PÁDEL</span>
        </div>

        <div className="relative isolate flex min-h-40 items-center justify-center overflow-hidden border-y border-primary/40 bg-muted">
          <div aria-hidden="true" className="absolute inset-4 border-2 border-primary/20">
            <div className="absolute inset-x-0 top-1/2 border-t-2 border-primary/20" />
            <div className="absolute inset-y-0 left-1/2 border-l-2 border-primary/20" />
          </div>
          <span aria-hidden="true" className="relative text-7xl">{player.emoji}</span>
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
            {results.matches} {results.matches === 1 ? "partido" : "partidos"}
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {results.matches === 0 ? "Por debutar" : "En la pista"}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {results.wins}V · {results.losses}D
            </span>
          </div>

          <dl className="divide-y rounded-md border bg-background/50 px-3">
            {attributes.map(({ label, emoji, value }) => (
              <div key={label} className="flex items-center justify-between gap-2 py-2">
                <dt className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className="text-lg">{emoji}</span>
                  {label}
                </dt>
                <dd className="text-xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <dl className="space-y-2 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Racha actual</dt>
              <dd className="text-right font-medium">
                {streakLabel}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Mejor racha</dt>
              <dd className="text-right font-medium">{results.bestStreak} {results.bestStreak === 1 ? "victoria" : "victorias"}</dd>
            </div>
          </dl>

          <div className="border-t border-primary/30 pt-3">
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Sello personal</p>
            {signature ? (
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-2xl">{signature.event.emoji}</span>
                <p className="min-w-0 flex-1 break-words text-sm font-medium">{signature.event.label}</p>
                <span className="shrink-0 text-sm tabular-nums">×{signature.count}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Tu leyenda está por escribir. Registra eventos en un partido.</p>
            )}
          </div>

          <footer className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <p>{period}</p>
            <p>Atributos = eventos positivos, negativos y divertidos registrados. El sello es el evento más repetido.</p>
          </footer>
        </div>
      </div>
    </article>
  );
}
