import { BarChart3, Home, Plus, Trophy, UsersRound } from "lucide-react";

const phoneScreen =
  "flex aspect-[430/932] w-full flex-col overflow-hidden rounded-[31px] bg-[#080b08] font-pixel text-[#f5f5ed]";
const previewContent = "flex min-h-0 flex-1 flex-col px-[15px] pt-6";
const overline =
  "mb-1 text-[10px] font-extrabold tracking-[0.13em] text-[#8ee000] uppercase";
const sectionHeading =
  "flex items-center justify-between text-[9px] tracking-[0.09em] text-[#a4a79f] uppercase";

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
    <div className="grid min-h-[58px] grid-cols-5 border-t border-[#252a24] bg-[#080b08] px-[5px] pt-[7px] pb-[5px]">
      {previewNavItems.map(({ label, icon: Icon, id }) => (
        <div
          className={`flex flex-col items-center justify-center gap-[3px] text-[7px] ${
            active === id ? "text-[#79dc0c]" : "text-[#8d918a]"
          }`}
          key={id}
        >
          <Icon aria-hidden="true" size={17} strokeWidth={2} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className={phoneScreen} aria-hidden="true">
      <div className={previewContent}>
        <p className={overline}>Los del jueves</p>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <strong className="text-[25px] leading-none">Padelaso</strong>
            <span className="mt-[5px] text-[10px] text-[#999d96]">
              24 partidos · 8 jugadores
            </span>
          </div>
          <span className="grid size-[42px] place-items-center rounded-full border border-[#30362f] bg-[#161b16] text-[22px]">
            🎾
          </span>
        </div>

        <div className="my-6 mb-[27px] grid min-h-[50px] w-full place-items-center rounded-[7px] bg-[#72db00] text-[15px] font-[850] text-[#233315] shadow-[0_5px_0_#466e15]">
          + Añadir partido
        </div>

        <div className={sectionHeading}>
          <span>Últimos partidos</span>
          <span className="normal-case tracking-normal text-[#73d900]">Ver todos</span>
        </div>

        <div className="mt-2.5 grid gap-2.5">
          {matches.map(({ date, score, winners, losers, event }) => (
            <div
              className="overflow-hidden rounded-[18px] border border-[#32342e] bg-[#24251f]"
              key={`${date}-${score}`}
            >
              <div className="flex min-h-[35px] items-center justify-between border-b border-[#3a3b35] px-3.5 text-[9px] text-[#a9aaa4] uppercase">
                <span>{date}</span>
                <strong className="text-sm text-white">{score}</strong>
              </div>
              <div className="flex min-h-[42px] items-center justify-between px-3.5 text-[11px]">
                <strong>{winners}</strong>
                <span className="text-[8px] text-[#898b85] uppercase">vs</span>
                <span className="text-[#898b85]">{losers}</span>
              </div>
              <div className="min-h-[27px] border-t border-[#3a3b35] px-3.5 pt-[7px] pb-1.5 text-[9px] text-[#a8aaa4]">
                {event}
              </div>
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
    <div className={phoneScreen} aria-hidden="true">
      <div className={previewContent}>
        <p className={overline}>Los del jueves</p>
        <div className="mb-[18px] flex flex-col">
          <strong className="text-[25px] leading-none">Estadísticas</strong>
          <span className="mt-[5px] text-[10px] text-[#999d96]">
            La clasificación no miente (casi nunca).
          </span>
        </div>

        <div className="grid min-h-[42px] grid-cols-3 items-center rounded-[10px] border border-[#343831] bg-[#242620] p-1 text-center text-[10px] text-[#9b9e97]">
          <strong className="grid h-8 place-items-center rounded-[7px] bg-[#080b08] text-white">
            General
          </strong>
          <span>Parejas</span>
          <span>Eventos</span>
        </div>

        <div className="my-4 mb-[18px] flex min-h-16 items-center justify-between rounded-[18px] border border-[#33451b] bg-[#11190b] px-[13px] py-[11px]">
          <div className="flex flex-col">
            <span className="text-[8px] font-extrabold tracking-[0.08em] text-[#79dc0c] uppercase">
              Jugador en racha
            </span>
            <strong className="mt-1 text-[15px]">🦊 Marc</strong>
          </div>
          <span className="rounded-full bg-[#72db00] px-2 pt-[5px] pb-1 text-[10px] text-[#32451e]">
            🔥 4 victorias
          </span>
        </div>

        <div className={`${sectionHeading} mb-2`}>
          <span>Ranking del grupo</span>
          <span className="tracking-normal text-[#9b9e97] normal-case">mín. 10 partidos</span>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-[#33352f] bg-[#24251f]">
          {ranking.map(({ place, player, detail, score }) => (
            <div
              className="grid min-h-[52px] grid-cols-[22px_1fr_auto] items-center border-b border-[#3a3b35] px-3 py-1.5 last:border-b-0"
              key={player}
            >
              <span className="text-sm font-[850] text-[#79dc0c]">{place}</span>
              <div className="flex flex-col">
                <strong className="text-[11px]">{player}</strong>
                <span className="mt-[3px] text-[7px] text-[#9b9e97]">{detail}</span>
              </div>
              <strong className="flex flex-col text-right text-[17px]">
                {score}
                <small className="text-[6px] font-medium tracking-[0.05em] text-[#8d918a] uppercase">
                  victorias
                </small>
              </strong>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex min-h-[66px] flex-col justify-center gap-[5px] rounded-[15px] border border-[#33352f] bg-[#24251f] p-2.5">
            <span className="text-[8px] text-[#9b9e97]">🎯 Más preciso</span>
            <strong className="text-[10px]">Pau · 9 aces</strong>
          </div>
          <div className="flex min-h-[66px] flex-col justify-center gap-[5px] rounded-[15px] border border-[#33352f] bg-[#24251f] p-2.5">
            <span className="text-[8px] text-[#9b9e97]">🤸 Showman</span>
            <strong className="text-[10px]">Javi · 7 caídas</strong>
          </div>
        </div>
      </div>
      <PreviewNav active="stats" />
    </div>
  );
}
