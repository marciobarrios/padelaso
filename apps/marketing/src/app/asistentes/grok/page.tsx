import type { Metadata } from "next";
import { CopyUrl } from "../copy-url";
import { BackLink } from "../from-app";
import { ExamplesSection, heading, link, mcpUrl, PermissionSection } from "../guide-parts";

const title = "Conectar Grok Bot · Padelaso";
const description = "Cómo conectar tu cuenta de Padelaso a Grok Bot para consultar partidos y estadísticas, y registrar partidos desde el chat.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/asistentes/grok" },
  openGraph: { title, description, url: "https://padelaso.com/asistentes/grok" },
  twitter: { title, description },
};

// Keep in sync with "Connecting Grok Bot" and the Cursor callback policy in apps/app/MCP.md (MAR-156).
// Grok Bot connects through Cursor's connector backend, so Padelaso's consent page and
// Integraciones settings may show it as "Cursor".
export default function GrokGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink sm:px-8 sm:py-16">
      <BackLink className={`${link} inline-flex min-h-11 items-center`}>← Volver a Padelaso</BackLink>
      <article className="mt-8 space-y-10 text-base leading-relaxed">
        <header className="space-y-4">
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase">Asistentes de IA</p>
          <h1 className="font-pixel text-4xl leading-tight tracking-tight sm:text-5xl">Padelaso en Grok Bot</h1>
          <p className="text-lg text-ink-soft">Pregunta por tus partidos, rachas y rankings, o registra un partido nuevo, sin salir de Grok Bot.</p>
          <p className="text-sm text-ink-soft">Actualizado el 27 de noviembre de 2026</p>
        </header>

        <aside aria-labelledby="requisitos" className="space-y-2 rounded-sm border-2 border-orange bg-card p-5">
          <h2 id="requisitos" className="font-[850]">Antes de empezar</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Necesitas una cuenta de Padelaso y pertenecer al menos a un grupo.</li>
            <li>No necesitas ningún ID de cliente, contraseña de aplicación ni cabecera: solo la URL de Padelaso y tu propia cuenta.</li>
            <li>Grok Bot se conecta a través de Cursor, así que Padelaso puede mostrarlo con el nombre <strong>Cursor</strong>.</li>
          </ul>
        </aside>

        <section aria-labelledby="pasos" className="space-y-5">
          <h2 id="pasos" className={heading}>Cómo conectarlo</h2>
          <p>Los nombres de los botones aparecen en inglés, tal como los muestra Grok Bot.</p>
          <ol className="list-decimal space-y-5 pl-6 marker:font-[850]">
            <li>En Grok Bot, añade un conector personalizado y elige <strong>Remote HTTPS</strong>.</li>
            <li className="space-y-3">
              <p>Escribe <strong>Padelaso</strong> como nombre y pega esta URL:</p>
              <CopyUrl url={mcpUrl} />
            </li>
            <li>Deja vacíos <strong>Client ID</strong> y <strong>Client Secret</strong>, y no añadas <strong>HTTP headers</strong>: Grok Bot se registra solo.</li>
            <li>Guarda el conector y conéctalo. Se abrirá Padelaso (puede decir que <strong>Cursor</strong> quiere acceder a tu cuenta): inicia sesión con tu cuenta, revisa el permiso y pulsa <strong>Permitir acceso</strong>.</li>
            <li>En un chat nuevo, pídele algo de Padelaso.</li>
          </ol>
          <p>Solo tienes que conectarlo una vez.</p>
        </section>

        <PermissionSection client="Grok Bot" />

        <ExamplesSection />

        <section aria-labelledby="desconectar" className="space-y-4">
          <h2 id="desconectar" className={heading}>Cómo desconectarlo</h2>
          <p>Abre <a href="https://app.padelaso.com/settings" className={link}>Ajustes de Padelaso</a>, busca <strong>Cursor</strong> en <strong>Integraciones</strong>, pulsa <strong>Desconectar</strong> y confírmalo. Un acceso ya emitido puede seguir funcionando hasta una hora. También puedes quitar el conector en Grok Bot, pero eso no revoca el permiso en Padelaso.</p>
        </section>

        <section aria-labelledby="problemas" className="space-y-4">
          <h2 id="problemas" className={heading}>Si algo falla</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong>Padelaso dice que la aplicación todavía no puede conectarse:</strong> revisa que la URL es exactamente la de arriba y que dejaste vacíos el ID y el secreto de cliente. Borra el conector y vuelve a crearlo.</li>
            <li><strong>Grok Bot dice que no puede registrar o corregir partidos:</strong> puede tener guardada una lista antigua de herramientas. Empieza un chat nuevo; si sigue igual, borra el conector y vuelve a crearlo.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
