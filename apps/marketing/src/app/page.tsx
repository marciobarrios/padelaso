import { ArrowUpRight, BarChart3, PartyPopper, UsersRound } from "lucide-react";
import { DashboardPreview, StatsPreview } from "./phone-previews";

const appUrl = "https://app.padelaso.com";

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
    <a className={`app-link ${className}`} href={appUrl}>
      {children}
      <ArrowUpRight aria-hidden="true" size={19} strokeWidth={2.5} />
    </a>
  );
}

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav className="nav shell" aria-label="Navegación principal">
        <a className="brand" href="#inicio" aria-label="Padelaso, inicio">
          <span className="brand-ball" aria-hidden="true">●</span>
          Padelaso
        </a>
        <AppLink className="nav-cta">Abrir la app</AppLink>
      </nav>

      <section className="hero shell" id="inicio">
        <div className="hero-copy">
          <p className="kicker">El pádel después del pádel</p>
          <h1>El tercer set<br />empieza aquí.</h1>
          <p className="hero-lede">
            Guarda los partidos, sigue las estadísticas y revive los momentazos de tu grupo
            de pádel.
          </p>
          <div className="hero-actions">
            <AppLink>Empezar a jugar</AppLink>
            <a className="text-link" href="#como-funciona">Ver cómo funciona <span aria-hidden="true">↓</span></a>
          </div>
          <p className="microcopy">Gratis · Sin hojas de cálculo · Hecho para el móvil</p>
        </div>

        <div className="hero-visual">
          <span className="sticker sticker-top">¡Puntazo!</span>
          <div
            className="phone phone-main"
            role="img"
            aria-label="Pantalla principal de Padelaso con los últimos partidos del grupo"
          >
            <DashboardPreview />
          </div>
          <span className="sticker sticker-bottom">🔥 4 seguidos</span>
        </div>
      </section>

      <div className="ticker" aria-hidden="true">
        <div>PARTIDOS · PUNTAZOS · PIQUES · REMONTADAS · ESTADÍSTICAS · PARTIDOS · PUNTAZOS · PIQUES · REMONTADAS · ESTADÍSTICAS ·</div>
      </div>

      <section className="features shell" id="como-funciona">
        <div className="section-heading">
          <p className="section-number">01 / EL JUEGO SIGUE</p>
          <h2>Todo lo que pasa<br />fuera de la pista.</h2>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, eyebrow, title, copy }, index) => (
            <article className="feature-card" key={title}>
              <div className="feature-index">0{index + 1}</div>
              <Icon aria-hidden="true" size={30} strokeWidth={2.2} />
              <p>{eyebrow}</p>
              <h3>{title}</h3>
              <span>{copy}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="showcase">
        <div className="showcase-inner shell">
          <div className="showcase-copy">
            <p className="section-number light">02 / LOS DATOS HABLAN</p>
            <h2>La memoria del grupo,<br /><em>partido a partido.</em></h2>
            <p>
              Padelaso convierte cada resultado en historias que dan para semanas:
              la pareja invencible, la remontada del año o esa racha que nadie quiere mencionar.
            </p>
            <ul>
              <li><span>✓</span> Clasificación ajustada por experiencia</li>
              <li><span>✓</span> Historial de parejas y rivales</li>
              <li><span>✓</span> Logros y momentazos del grupo</li>
            </ul>
          </div>
          <div
            className="phone phone-stats"
            role="img"
            aria-label="Estadísticas de jugadores y clasificación dentro de Padelaso"
          >
            <StatsPreview />
          </div>
        </div>
      </section>

      <section className="final-cta shell">
        <div>
          <p className="section-number">03 / A JUGAR</p>
          <h2>Tu próximo partido<br />merece un postpartido.</h2>
        </div>
        <div className="final-action">
          <p>Crea el grupo, apunta el resultado y deja que Padelaso recuerde el resto.</p>
          <AppLink>Entrar en Padelaso</AppLink>
        </div>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#inicio"><span className="brand-ball" aria-hidden="true">●</span>Padelaso</a>
        <p>Hecho para grupos que se toman el pádel lo justo.</p>
        <p>© {new Date().getFullYear()} Padelaso</p>
      </footer>
    </main>
  );
}
