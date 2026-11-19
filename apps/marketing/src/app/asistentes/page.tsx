import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, GuideLink } from "./from-app";

const title = "Padelaso en tu asistente de IA · Padelaso";
const description = "Qué puedes pedirle a ChatGPT y a otros asistentes conectados a Padelaso, cómo registran un partido y qué límites tienen.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/asistentes" },
  openGraph: { title, description, url: "https://padelaso.com/asistentes" },
  twitter: { title, description },
};

const link = "underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus";
const heading = "font-pixel text-2xl leading-tight tracking-tight";

/**
 * One entry per supported assistant. What follows on this page is the same in
 * every client; only connecting, approval prompts and refreshing tools differ,
 * and those live in each client's own guide.
 */
const clients = [
  {
    name: "ChatGPT",
    href: "/asistentes/chatgpt",
    summary: "Solo necesitas la URL de Padelaso y tu cuenta. Sin ID ni secreto de cliente.",
  },
];

const examples = [
  "Guarda el partido de hoy en Los del jueves: Ana y Pablo ganaron a Lucía y Marta 6-4, 3-6, 7-5.",
  "Enséñame mis últimos cinco partidos.",
  "¿Qué estadísticas tiene Pablo?",
  "¿Quién va primero en el ranking del grupo?",
  "Añade dos aces de Ana al partido de ayer.",
  "Corrige el partido de ayer: el segundo set fue 6-3, no 6-4.",
];

// Keep in sync with validateMatchDraft (packages/domain/src/matches.ts), the
// create_match and update_match tool schemas, and public.create_match.
const rules = [
  "Cada equipo tiene dos jugadores del grupo, y los cuatro son distintos.",
  "De 1 a 5 sets, con juegos de 0 a 99 por equipo. Un set 0-0 no cuenta: no lo incluyas.",
  "La fecha es la de ahora si no dices otra. No puede ser futura ni de hace más de un año.",
  "La pista (de 1 a 99) y los eventos (aces, dobles faltas, jugadas del partido…) son opcionales. Hasta 50 eventos por partido, siempre de alguno de los cuatro jugadores.",
  "Si en los últimos 15 minutos ya se guardó un partido igual (mismo grupo, mismos equipos y resultado, y una fecha de hasta 12 horas de diferencia), Padelaso devuelve ese partido en lugar de crear uno repetido.",
];

export default function AssistantsHelpPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink sm:px-8 sm:py-16">
      <BackLink className={`${link} inline-flex min-h-11 items-center`}>← Volver a Padelaso</BackLink>
      <article className="mt-8 space-y-10 text-base leading-relaxed">
        <header className="space-y-4">
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase">Asistentes de IA</p>
          <h1 className="font-pixel text-4xl leading-tight tracking-tight sm:text-5xl">Padelaso en tu asistente de IA</h1>
          <p className="text-lg text-ink-soft">Conecta tu cuenta a un asistente de IA y pídele tus partidos, estadísticas y rankings, o que registre el partido de hoy, sin abrir la app.</p>
          <p className="text-sm text-ink-soft">Actualizado el 19 de noviembre de 2026</p>
        </header>

        <section aria-labelledby="conectar" className="space-y-4">
          <h2 id="conectar" className={heading}>Conecta tu asistente</h2>
          <p>Necesitas una cuenta de Padelaso y pertenecer al menos a un grupo. Solo tienes que conectarlo una vez.</p>
          <ul className="space-y-3">
            {clients.map((client) => (
              <li key={client.name} className="rounded-sm border-2 border-orange bg-card p-5">
                <GuideLink href={client.href} className={`${link} font-[850] text-lg`}>Conectar {client.name}</GuideLink>
                <p className="mt-1 text-ink-soft">{client.summary}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">Iremos añadiendo aquí más asistentes. Lo que pueden hacer y sus límites son iguales en todos.</p>
        </section>

        <section aria-labelledby="ejemplos" className="space-y-4">
          <h2 id="ejemplos" className={heading}>Qué puedes pedirle</h2>
          <ul className="space-y-2">
            {examples.map((example) => (
              <li key={example} className="rounded-sm border border-line bg-card px-4 py-3">{example}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">Si perteneces a varios grupos, dile en cuál. El asistente solo ve los grupos de los que eres miembro.</p>
        </section>

        <section aria-labelledby="registrar" className="space-y-4">
          <h2 id="registrar" className={heading}>Cómo registra un partido</h2>
          <ol className="list-decimal space-y-3 pl-6 marker:font-[850]">
            <li>Busca el grupo y los cuatro jugadores. Si un nombre coincide con varios jugadores o con ninguno, te pregunta: nunca adivina.</li>
            <li>Padelaso le pide que te repita los equipos, los sets y la fecha, y que te pida confirmación antes de guardar. Tu asistente también puede mostrarte su propio aviso de aprobación antes de guardar datos.</li>
            <li>Te responde con un enlace al partido guardado. Cuenta en las estadísticas y los rankings desde ese momento.</li>
          </ol>
        </section>

        <section aria-labelledby="reglas" className="space-y-4">
          <h2 id="reglas" className={heading}>Reglas de un partido</h2>
          <ul className="list-disc space-y-2 pl-6">
            {rules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </section>

        <section aria-labelledby="corregir" className="space-y-4">
          <h2 id="corregir" className={heading}>Corregir un partido</h2>
          <p>Si algo salió mal, pídeselo al asistente. Padelaso le pide que te enseñe lo que va a cambiar y que te pida confirmación antes. Puede:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Añadir eventos a un partido ya registrado.</li>
            <li>Quitar un evento registrado por error, de uno en uno.</li>
            <li>Corregir la fecha, la pista, los equipos o el resultado. Para cambiar a un jugador que tiene eventos en el partido, primero hay que quitar sus eventos.</li>
          </ul>
          <p>No puede borrar partidos, ni cambiar o borrar jugadores o grupos. Para eso, usa <a href="https://app.padelaso.com" className={link}>la app</a>.</p>
        </section>

        <section aria-labelledby="problemas" className="space-y-4">
          <h2 id="problemas" className={heading}>Si algo falla</h2>
          <p>Si el asistente dice que no puede registrar o corregir partidos, puede que tenga guardada una lista antigua de herramientas. Empieza un chat nuevo o actualiza la conexión de Padelaso en los ajustes de tu asistente. Los pasos exactos están en la guía de cada uno.</p>
          <p>Para desconectar un asistente, abre <a href="https://app.padelaso.com/settings" className={link}>Ajustes de Padelaso</a> y búscalo en <strong>Integraciones</strong>. Más detalles sobre tus datos en <Link href="/privacidad" className={link}>Privacidad</Link>.</p>
        </section>
      </article>
    </main>
  );
}
