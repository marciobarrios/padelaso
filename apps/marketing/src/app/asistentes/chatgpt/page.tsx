import type { Metadata } from "next";
import Link from "next/link";
import { CopyUrl } from "../copy-url";

const title = "Conectar ChatGPT · Padelaso";
const description = "Cómo conectar tu cuenta de Padelaso a ChatGPT para consultar partidos y estadísticas, y registrar partidos desde el chat.";
const mcpUrl = "https://app.padelaso.com/api/mcp";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/asistentes/chatgpt" },
  openGraph: { title, description, url: "https://padelaso.com/asistentes/chatgpt" },
  twitter: { title, description },
};

const link = "underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus";
const heading = "font-pixel text-2xl leading-tight tracking-tight";

const examples = [
  "Enséñame los últimos partidos de mi grupo.",
  "¿Cuáles son mis estadísticas este año? ¿Con quién gano más?",
  "¿Quién va primero en el ranking del grupo?",
  "Registra un partido: Ana y yo ganamos a Luis y Marta 6-4, 3-6, 7-5.",
];

export default function ChatGptGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink sm:px-8 sm:py-16">
      <Link href="/" className={`${link} inline-flex min-h-11 items-center`}>← Volver a Padelaso</Link>
      <article className="mt-8 space-y-10 text-base leading-relaxed">
        <header className="space-y-4">
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase">Asistentes de IA</p>
          <h1 className="font-pixel text-4xl leading-tight tracking-tight sm:text-5xl">Padelaso en ChatGPT</h1>
          <p className="text-lg text-ink-soft">Pregunta por tus partidos, rachas y rankings, o registra un partido nuevo, sin salir de ChatGPT.</p>
          <p className="text-sm text-ink-soft">Actualizado el 17 de noviembre de 2026</p>
        </header>

        <aside aria-labelledby="requisitos" className="space-y-2 rounded-sm border-2 border-orange bg-card p-5">
          <h2 id="requisitos" className="font-[850]">Antes de empezar</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Necesitas una cuenta de Padelaso y pertenecer al menos a un grupo.</li>
            <li>Necesitas ChatGPT en la web con un plan de pago: funciona con Plus, y también con Business, Enterprise y Edu, donde tu administrador puede limitarlo. Consulta los <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" className={link}>requisitos actuales de OpenAI</a>.</li>
            <li>No necesitas ningún ID de cliente ni contraseña de aplicación: solo la URL de Padelaso y tu propia cuenta.</li>
          </ul>
        </aside>

        <section aria-labelledby="pasos" className="space-y-5">
          <h2 id="pasos" className={heading}>Cómo conectarlo</h2>
          <p>Los nombres de los botones aparecen en inglés, tal como los muestra ChatGPT; si lo usas en español, pueden estar traducidos.</p>
          <ol className="list-decimal space-y-5 pl-6 marker:font-[850]">
            <li>Abre <a href="https://chatgpt.com/plugins" className={link}>Plugins en ChatGPT</a>, pulsa <strong>+</strong> (o <strong>Add</strong>) arriba a la derecha y elige <strong>Add custom MCP server</strong>. No uses la pestaña <strong>MCPs</strong>: añade servidores locales y no funciona con Padelaso.</li>
            <li className="space-y-3">
              <p>Escribe <strong>Padelaso</strong> como nombre y pega esta URL en <strong>Server URL</strong>, dentro de <strong>Connection</strong>:</p>
              <CopyUrl url={mcpUrl} />
            </li>
            <li>En autenticación, elige <strong>OAuth</strong>. Deja vacíos el ID y el secreto de cliente (<strong>Advanced OAuth settings</strong>): ChatGPT se registra solo.</li>
            <li>Lee el aviso de riesgo de ChatGPT, marca <strong>I understand and want to continue</strong> y pulsa <strong>Create as a plugin</strong>.</li>
            <li>Pulsa <strong>Connect</strong> para instalarlo. Se abrirá Padelaso: inicia sesión con tu cuenta, revisa el permiso y pulsa <strong>Permitir acceso</strong>.</li>
            <li>En un chat nuevo, escribe <strong>@</strong> y elige <strong>Padelaso</strong>.</li>
          </ol>
          <p>Solo tienes que conectarlo una vez. Después podrás usarlo en tus chats de ChatGPT con la misma cuenta.</p>
        </section>

        <section aria-labelledby="permiso" className="space-y-4">
          <h2 id="permiso" className={heading}>Qué permiso das</h2>
          <p>Padelaso pide un único permiso: <strong>leer y registrar partidos</strong>. Con él, ChatGPT puede:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Ver los grupos a los que perteneces.</li>
            <li>Consultar los jugadores, el historial de partidos y las estadísticas de esos grupos.</li>
            <li>Registrar partidos nuevos en esos grupos. ChatGPT te pide confirmar los detalles antes de guardarlos.</li>
          </ul>
          <p>Las herramientas actuales no permiten editar ni borrar partidos, jugadores o grupos. El acceso está limitado a los grupos de los que eres miembro. Más detalles en <Link href="/privacidad" className={link}>Privacidad</Link>.</p>
        </section>

        <section aria-labelledby="ejemplos" className="space-y-4">
          <h2 id="ejemplos" className={heading}>Prueba a pedirle</h2>
          <ul className="space-y-2">
            {examples.map((example) => (
              <li key={example} className="rounded-sm border border-line bg-card px-4 py-3">@Padelaso {example}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">Si perteneces a varios grupos, dile en cuál quieres consultar o registrar.</p>
        </section>

        <section aria-labelledby="desconectar" className="space-y-4">
          <h2 id="desconectar" className={heading}>Cómo desconectarlo</h2>
          <p>Abre <a href="https://app.padelaso.com/settings" className={link}>Ajustes de Padelaso</a>, busca ChatGPT en <strong>Integraciones</strong>, pulsa <strong>Desconectar</strong> y confírmalo. Un acceso ya emitido puede seguir funcionando hasta una hora. También puedes quitar el plugin en ChatGPT, pero eso no revoca el permiso en Padelaso.</p>
        </section>

        <section aria-labelledby="problemas" className="space-y-4">
          <h2 id="problemas" className={heading}>Si algo falla</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong>No ves Add custom MCP server:</strong> tu plan o tu espacio de trabajo no lo permite. Pregunta a tu administrador.</li>
            <li><strong>ChatGPT te pide un ID o secreto de cliente:</strong> no los necesitas. Borra el plugin y vuelve a crearlo con la URL y OAuth.</li>
            <li><strong>Padelaso no responde en el chat:</strong> escribe @ y elige Padelaso de nuevo, o desconéctalo y vuelve a conectarlo.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
