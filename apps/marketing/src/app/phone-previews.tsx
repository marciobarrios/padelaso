import { BarChart3, Home, Plus, Trophy, UsersRound } from "lucide-react";

const matches = [
  {
    date: "Ayer",
    score: "6-4 3-6 10-7",
    winners: "Marc · Dani",
    losers: "Àlex · Javi",
    event: "🔄 Remontada épica",
  },
  {
    date: "12 ago",
    score: "6-2 6-3",
    winners: "Pau · Javi",
    losers: "Marc · Àlex",
    event: "🐍 Víbora letal",
  },
  {
    date: "7 ago",
    score: "7-5 6-4",
    winners: "Dani · Pau",
    losers: "Nil · Javi",
    event: "🤸 Caída épica",
  },
];

const ranking = [
  { place: 1, player: "🦊 Marc", detail: "18 partidos · racha +4", score: "68%" },
  { place: 2, player: "🐙 Pau", detail: "21 partidos · racha +2", score: "62%" },
  { place: 3, player: "🦁 Dani", detail: "16 partidos · racha +1", score: "59%" },
  { place: 4, player: "🐻 Javi", detail: "24 partidos · racha -1", score: "54%" },
  { place: 5, player: "🐸 Àlex", detail: "19 partidos · racha -2", score: "48%" },
];

const previewNavItems = [
  { label: "Inicio", icon: Home, id: "home" },
  { label: "Partidos", icon: Trophy, id: "matches" },
  { label: "Añadir", icon: Plus, id: "new" },
  { label: "Jugadores", icon: UsersRound, id: "players" },
  { label: "Stats", icon: BarChart3, id: "stats" },
] as const;

function PreviewNav({ active }: { active: "home" | "stats" }) {
  return (
    <div className="preview-nav">
      {previewNavItems.map(({ label, icon: Icon, id }) => (
        <div className={`preview-nav-item ${active === id ? "is-active" : ""}`} key={id}>
          <Icon size={18} strokeWidth={2} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className="phone-screen" aria-hidden="true">
      <div className="preview-content dashboard-preview">
        <p className="preview-overline">Los del jueves</p>
        <div className="preview-title-row">
          <div>
            <strong>Padelaso</strong>
            <span>24 partidos · 8 jugadores</span>
          </div>
          <span className="preview-ball">🎾</span>
        </div>

        <div className="preview-primary-action">+ Añadir partido</div>

        <div className="preview-section-heading">
          <span>Últimos partidos</span>
          <span>Ver todos</span>
        </div>

        <div className="preview-match-list">
          {matches.map(({ date, score, winners, losers, event }) => (
            <div className="preview-match-card" key={`${date}-${score}`}>
              <div className="preview-match-topline">
                <span>{date}</span>
                <strong>{score}</strong>
              </div>
              <div className="preview-match-players">
                <strong>{winners}</strong>
                <span>vs</span>
                <span>{losers}</span>
              </div>
              <div className="preview-match-event">{event}</div>
            </div>
          ))}
        </div>
      </div>
      <PreviewNav active="home" />
    </div>
  );
}

export function StatsPreview() {
  return (
    <div className="phone-screen" aria-hidden="true">
      <div className="preview-content stats-preview">
        <p className="preview-overline">Los del jueves</p>
        <div className="preview-stats-title">
          <strong>Estadísticas</strong>
          <span>La clasificación no miente (casi nunca).</span>
        </div>

        <div className="preview-tabs">
          <strong>General</strong>
          <span>Parejas</span>
          <span>Eventos</span>
        </div>

        <div className="preview-streak-card">
          <div>
            <span>Jugador en racha</span>
            <strong>🦊 Marc</strong>
          </div>
          <span>🔥 4 victorias</span>
        </div>

        <div className="preview-section-heading ranking-heading">
          <span>Ranking del grupo</span>
          <span>mín. 10 partidos</span>
        </div>

        <div className="preview-ranking-card">
          {ranking.map(({ place, player, detail, score }) => (
            <div className="preview-ranking-row" key={player}>
              <span>{place}</span>
              <div>
                <strong>{player}</strong>
                <span>{detail}</span>
              </div>
              <strong>{score}<small> victorias</small></strong>
            </div>
          ))}
        </div>

        <div className="preview-achievements">
          <div><span>🎯 Más preciso</span><strong>Pau · 9 aces</strong></div>
          <div><span>🤸 Showman</span><strong>Javi · 7 caídas</strong></div>
        </div>
      </div>
      <PreviewNav active="stats" />
    </div>
  );
}
