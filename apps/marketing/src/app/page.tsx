import { ArrowUpRight, BarChart3, PartyPopper, UsersRound } from "lucide-react";
import { DashboardPreview, StatsPreview } from "./phone-previews";
import { ThemeSwitcher } from "./theme-switcher";

const appUrl = "https://app.padelaso.com";

const shell =
  "mx-auto w-[min(1160px,calc(100%_-_40px))] max-[560px]:w-[min(1160px,calc(100%_-_28px))]";
const displayHeading = "font-pixel leading-[0.91] tracking-[-0.065em]";
const sectionHeading = `${displayHeading} text-[clamp(50px,6vw,84px)]`;
const sectionNumber =
  "mt-[5px] text-xs font-[850] tracking-[0.12em] uppercase";
const phone =
  "relative z-10 w-[min(100%,360px)] overflow-hidden rounded-[35px] border-[3px] border-[#101b16] bg-[#101b16] shadow-[14px_16px_0_var(--phone-shadow)] max-[560px]:w-[min(78vw,330px)]";

const features = [
  {
    icon: UsersRound,
    eyebrow: "Tu grupo, tus reglas",
    title: "Todos los partidos en un mismo sitio",
    copy: "Crea vuestro grupo, añade jugadores y deja de buscar resultados perdidos en el chat.",
  },
  {
    icon: PartyPopper,
    eyebrow: "Mucho más que el marcador",
    title: "Que no se pierda ningún momentazo",
    copy: "Añade puntos y eventos en tiempo real desde el Apple Watch: aces, caídas épicas, remontadas y golpes imposibles.",
  },
  {
    icon: BarChart3,
    eyebrow: "Pique sano",
    title: "Estadísticas con memoria",
    copy: "Rachas, parejas, rivales y logros —algunos bastante graciosos— que aparecen al combinar varios eventos.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Padelaso",
  applicationCategory: "SportsApplication",
  operatingSystem: "Web",
  inLanguage: "es",
  url: appUrl,
  description:
    "Aplicación para registrar partidos de pádel, momentazos y estadísticas entre amigos.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
};

function AppLink({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <a
      className={`inline-flex min-h-[52px] items-center justify-center gap-[9px] rounded-sm border-2 border-ink bg-button px-[21px] font-[750] text-button-ink shadow-[5px_5px_0_var(--color-orange)] transition-[transform,box-shadow] duration-150 ease-[ease] hover:shadow-[3px_3px_0_var(--color-orange)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus motion-safe:hover:[transform:translate(2px,2px)] motion-reduce:transition-none ${className}`}
      href={appUrl}
    >
      {children}
      <ArrowUpRight aria-hidden="true" size={19} strokeWidth={2.5} />
    </a>
  );
}

function Brand() {
  return (
    <a
      className="inline-flex items-center gap-[9px] font-pixel text-2xl font-extrabold tracking-[-0.05em] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus max-[560px]:text-[21px]"
      href="#inicio"
      aria-label="Padelaso, inicio"
    >
      <span
        className="text-[31px] leading-none text-orange [text-shadow:7px_0_0_var(--color-acid)] [transform:translateY(-1px)]"
        aria-hidden="true"
      >
        ●
      </span>
      Padelaso
    </a>
  );
}

export default function Home() {
  return (
    <main className="bg-paper text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav
        className={`${shell} flex min-h-[84px] items-center justify-between gap-4 border-b border-line max-[560px]:min-h-[72px]`}
        aria-label="Navegación principal"
      >
        <Brand />
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <AppLink className="min-h-[42px] px-4 text-sm max-sm:hidden">Abrir la app</AppLink>
        </div>
      </nav>

      <section
        className={`${shell} grid min-h-[690px] grid-cols-[1.08fr_0.92fr] items-center gap-[70px] overflow-hidden pt-[74px] pb-[62px] max-[850px]:grid-cols-1 max-[850px]:gap-[45px] max-[850px]:pt-[58px] max-[560px]:pt-12`}
        id="inicio"
      >
        <div className="max-[850px]:text-center">
          <p className="mb-[26px] flex items-center gap-2.5 text-[13px] font-extrabold tracking-[0.08em] uppercase max-[850px]:justify-center">
            La app para tu grupo de pádel
          </p>
          <h1
            className={`${displayHeading} max-w-[700px] text-[clamp(66px,7.5vw,112px)] max-[560px]:text-[clamp(58px,19vw,82px)]`}
          >
            El tercer set
            <br />
            empieza aquí.
          </h1>
          <p className="my-[29px] mb-[30px] max-w-[590px] text-[clamp(18px,2vw,22px)] leading-normal text-ink-soft max-[850px]:mx-auto max-[560px]:text-lg">
            Guarda los partidos, sigue las estadísticas y revive los momentazos de tu grupo
            de pádel.
          </p>
          <div className="flex items-center gap-[27px] max-[850px]:justify-center max-[560px]:flex-col max-[560px]:gap-3">
            <AppLink className="max-[560px]:w-[min(100%,330px)]">Empezar a jugar</AppLink>
            <a
              className="border-b-2 border-ink py-3 font-[750] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
              href="#como-funciona"
            >
              Ver cómo funciona <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className="mt-5 text-[13px] text-ink-soft">
            Gratis · Sin hojas de cálculo · Hecho para el móvil
          </p>
        </div>

        <div className="relative grid min-h-[520px] place-items-center max-[850px]:min-h-[560px]">
          <div
            className="absolute size-[430px] rounded-full border-2 border-ink bg-acid shadow-[17px_17px_0_var(--color-mint)] max-[560px]:size-[330px]"
            aria-hidden="true"
          />
          <span className="absolute top-[45px] right-[14px] z-20 border-2 border-ink bg-orange px-3.5 pt-2.5 pb-2 font-pixel font-extrabold text-white shadow-[5px_5px_0_var(--color-ink)] [transform:rotate(7deg)]">
            ¡Puntazo!
          </span>
          <div
            className={`${phone} [transform:rotate(2.5deg)]`}
            role="img"
            aria-label="Pantalla principal de Padelaso con los últimos partidos del grupo"
          >
            <DashboardPreview />
          </div>
          <span className="absolute bottom-10 left-2 z-20 border-2 border-ink bg-acid px-3.5 pt-2.5 pb-2 font-pixel font-extrabold text-acid-ink shadow-[5px_5px_0_var(--color-ink)] [transform:rotate(-5deg)]">
            🔥 4 seguidos
          </span>
        </div>
      </section>

      <div
        className="overflow-hidden border-y-2 border-ink bg-orange py-[13px] pt-[15px] font-pixel text-lg font-extrabold tracking-[0.06em] whitespace-nowrap text-white"
        aria-hidden="true"
      >
        <div className="flex w-max will-change-transform motion-safe:animate-[ticker_35s_linear_infinite]">
          {[0, 1].map((group) => (
            <div
              className="flex min-w-screen flex-none items-center justify-around gap-[18px]"
              key={group}
            >
              {Array.from({ length: 2 }, () => [
                "PARTIDOS",
                "PUNTAZOS",
                "PIQUES",
                "REMONTADAS",
                "ESTADÍSTICAS",
                "LOGROS",
                "CLASIFICACIÓN",
                "RACHAS",
              ])
                .flat()
                .flatMap((item, index) => [
                  <span key={`${item}-${index}`}>{item}</span>,
                  <span className="text-acid" key={`separator-${index}`}>
                    ·
                  </span>,
                ])}
            </div>
          ))}
        </div>
      </div>

      <section
        className={`${shell} pt-[110px] pb-[120px] max-[560px]:py-[82px]`}
        id="como-funciona"
      >
        <div className="mb-[60px] grid grid-cols-[1fr_2fr] items-start max-[850px]:grid-cols-1 max-[850px]:gap-6">
          <p className={sectionNumber}>01 / EL JUEGO SIGUE</p>
          <h2 className={sectionHeading}>
            Todo lo que pasa
            <br />
            fuera de la pista.
          </h2>
        </div>
        <div className="grid grid-cols-3 border-2 border-ink max-[850px]:grid-cols-1">
          {features.map(({ icon: Icon, eyebrow, title, copy }, index) => {
            const isHighlighted = index === 1;

            return (
              <article
                className={`relative min-h-[380px] border-r-2 border-ink p-7 last:border-r-0 max-[850px]:min-h-[300px] max-[850px]:border-r-0 max-[850px]:border-b-2 max-[850px]:last:border-b-0 ${
                  isHighlighted ? "bg-acid text-acid-ink" : "bg-card"
                }`}
                key={title}
              >
                <div className="absolute top-5 right-[22px] font-pixel text-sm">
                  0{index + 1}
                </div>
                <Icon
                  className="mt-[42px] mb-[50px] max-[850px]:mb-8"
                  aria-hidden="true"
                  size={30}
                  strokeWidth={2.2}
                />
                <p
                  className={`mb-3 text-xs font-[850] tracking-[0.09em] uppercase ${
                    isHighlighted ? "text-acid-ink/75" : "text-ink-soft"
                  }`}
                >
                  {eyebrow}
                </p>
                <h3 className="mb-[15px] font-pixel text-[27px] leading-[1.05] tracking-[-0.04em]">
                  {title}
                </h3>
                <span
                  className={`leading-[1.55] ${
                    isHighlighted ? "text-acid-ink/75" : "text-ink-soft"
                  }`}
                >
                  {copy}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden bg-showcase text-showcase-ink">
        <div
          className={`${shell} grid min-h-[740px] grid-cols-[1.05fr_0.95fr] items-center gap-[85px] py-[90px] max-[850px]:grid-cols-1 max-[850px]:gap-[55px] max-[560px]:py-20`}
        >
          <div className="max-[850px]:text-center">
            <p className={`${sectionNumber} text-acid`}>02 / LOS DATOS HABLAN</p>
            <h2 className={`${sectionHeading} my-[30px] mt-[25px]`}>
              La memoria del grupo,
              <br />
              <em className="font-normal text-acid not-italic">partido a partido.</em>
            </h2>
            <p className="max-w-[600px] text-lg leading-[1.6] text-showcase-soft max-[850px]:mx-auto">
              Padelaso convierte cada resultado en historias que dan para semanas: la pareja
              invencible, la remontada del año o esa racha que nadie quiere mencionar.
            </p>
            <ul className="mt-7 grid list-none gap-[13px] p-0 font-bold max-[850px]:mx-auto max-[850px]:w-fit max-[850px]:text-left">
              <li>
                <span className="mr-2.5 text-acid">✓</span> Clasificación ajustada por
                experiencia
              </li>
              <li>
                <span className="mr-2.5 text-acid">✓</span> Historial de parejas y rivales
              </li>
              <li>
                <span className="mr-2.5 text-acid">✓</span> Logros y momentazos del grupo
              </li>
            </ul>
          </div>
          <div
            className={`${phone} justify-self-center shadow-[16px_16px_0_var(--color-orange)] [transform:rotate(-2deg)]`}
            role="img"
            aria-label="Estadísticas de jugadores y clasificación dentro de Padelaso"
          >
            <StatsPreview />
          </div>
        </div>
      </section>

      <section
        className={`${shell} grid grid-cols-[1.3fr_0.7fr] items-end gap-20 py-[120px] max-[850px]:grid-cols-1 max-[850px]:gap-[35px] max-[560px]:py-[82px]`}
      >
        <div>
          <p className={sectionNumber}>03 / A JUGAR</p>
          <h2 className={`${sectionHeading} mt-[25px]`}>
            Tu próximo partido
            <br />
            merece un postpartido.
          </h2>
        </div>
        <div>
          <p className="mb-7 text-lg leading-[1.55] text-ink-soft">
            Crea el grupo, apunta el resultado y deja que Padelaso recuerde el resto.
          </p>
          <AppLink>Entrar en Padelaso</AppLink>
        </div>
      </section>

      <footer
        className={`${shell} grid min-h-[100px] grid-cols-3 items-center border-t border-line py-[26px] text-[13px] text-ink-soft max-[560px]:grid-cols-1 max-[560px]:gap-3.5 max-[560px]:text-center`}
      >
        <Brand />
        <p className="text-center max-[560px]:m-0">Hecho para grupos que se toman el pádel lo justo.</p>
        <p className="text-right max-[560px]:m-0 max-[560px]:text-center">
          © {new Date().getFullYear()} Padelaso
        </p>
      </footer>
    </main>
  );
}
