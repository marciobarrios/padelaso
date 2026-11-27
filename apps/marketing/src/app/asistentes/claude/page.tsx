import type { Metadata } from "next";
import { CopyUrl } from "../copy-url";
import { BackLink } from "../from-app";
import { ExamplesSection, heading, link, mcpUrl, PermissionSection } from "../guide-parts";

const title = "Conectar Claude · Padelaso";
const description = "Cómo conectar tu cuenta de Padelaso a Claude para consultar partidos y estadísticas, y registrar partidos desde el chat.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/asistentes/claude" },
  openGraph: { title, description, url: "https://padelaso.com/asistentes/claude" },
  twitter: { title, description },
};

// Keep in sync with "Connecting Claude" and the Claude callback policy in apps/app/MCP.md (MAR-200).
export default function ClaudeGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink sm:px-8 sm:py-16">
      <BackLink className={`${link} inline-flex min-h-11 items-center`}>← Volver a Padelaso</BackLink>
      <article className="mt-8 space-y-10 text-base leading-relaxed">
        <header className="space-y-4">
          <p className="text-[13px] font-extrabold tracking-[0.08em] uppercase">Asistentes de IA</p>
          <h1 className="font-pixel text-4xl leading-tight tracking-tight sm:text-5xl">Padelaso en Claude</h1>
          <p className="text-lg text-ink-soft">Pregunta por tus partidos, rachas y rankings, o registra un partido nuevo, sin salir de Claude.</p>
          <p className="text-sm text-ink-soft">Actualizado el 27 de noviembre de 2026</p>
        </header>

        <aside aria-labelledby="requisitos" className="space-y-2 rounded-sm border-2 border-orange bg-card p-5">
          <h2 id="requisitos" className="font-[850]">Antes de empezar</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Necesitas una cuenta de Padelaso y pertenecer al menos a un grupo.</li>
            <li>Puedes añadirlo desde Claude en la web (claude.ai) o en la app de escritorio. Funciona en todos los planes; en el plan gratuito solo puedes tener un conector personalizado. En Team y Enterprise, lo añade primero un administrador. Consulta los <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" className={link}>requisitos actuales de Anthropic</a>.</li>
            <li>No necesitas ningún ID de cliente ni contraseña de aplicación: solo la URL de Padelaso y tu propia cuenta.</li>
          </ul>
        </aside>

        <section aria-labelledby="pasos" className="space-y-5">
          <h2 id="pasos" className={heading}>Cómo conectarlo</h2>
          <p>Los nombres de los botones aparecen en inglés, tal como los muestra Claude; si lo usas en español, pueden estar traducidos.</p>
          <ol className="list-decimal space-y-5 pl-6 marker:font-[850]">
            <li>Abre <strong>Customize → Connectors</strong> en Claude, pulsa <strong>+ Add</strong> y elige <strong>Add custom connector</strong>.</li>
            <li className="space-y-3">
              <p>Escribe <strong>Padelaso</strong> como nombre, pega esta URL y pulsa <strong>Continue</strong>:</p>
              <CopyUrl url={mcpUrl} />
            </li>
            <li>Claude detecta que Padelaso usa inicio de sesión. Pulsa <strong>Continue</strong> otra vez.</li>
            <li>En <strong>OAuth client</strong>, elige <strong>Register automatically</strong>: Claude se registra solo, sin ID ni secreto de cliente. La opción recomendada por Claude (<strong>Use Claude&apos;s published identity</strong>) no funciona con Padelaso. No añadas nada en <strong>Request headers</strong> y pulsa <strong>Add</strong>.</li>
            <li>Pulsa <strong>Connect</strong> si Claude no lo abre solo. Se abrirá Padelaso: inicia sesión con tu cuenta, revisa el permiso y pulsa <strong>Permitir acceso</strong>.</li>
            <li>En un chat nuevo, pídele algo de Padelaso. Si no lo usa, abre el menú <strong>+</strong> del chat, entra en <strong>Connectors</strong> y comprueba que Padelaso está activado.</li>
          </ol>
          <p>Solo tienes que conectarlo una vez. Después podrás usarlo en tus chats de Claude con la misma cuenta. Antes de guardar o cambiar datos, Claude te pide permiso para usar la herramienta: puedes permitirlo una vez o siempre.</p>
          <p><strong>En Claude Team o Enterprise</strong>, un administrador lo añade primero en <strong>Organization settings → Connectors → Add → Custom → Web</strong>, con los mismos pasos desde el 2. Después, cada miembro abre <strong>Customize → Connectors</strong>, busca Padelaso y pulsa <strong>Connect</strong>.</p>
        </section>

        <PermissionSection client="Claude" />

        <ExamplesSection />

        <section aria-labelledby="desconectar" className="space-y-4">
          <h2 id="desconectar" className={heading}>Cómo desconectarlo</h2>
          <p>Abre <a href="https://app.padelaso.com/settings" className={link}>Ajustes de Padelaso</a>, busca Claude en <strong>Integraciones</strong>, pulsa <strong>Desconectar</strong> y confírmalo. Si Claude aparece más de una vez, desconecta todas. Un acceso ya emitido puede seguir funcionando hasta una hora. También puedes quitar el conector en Claude, pero eso no revoca el permiso en Padelaso.</p>
        </section>

        <section aria-labelledby="problemas" className="space-y-4">
          <h2 id="problemas" className={heading}>Si algo falla</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li><strong>No ves Add custom connector:</strong> en Team o Enterprise, pide a tu administrador que añada Padelaso a la organización; después podrás conectarlo tú.</li>
            <li><strong>Padelaso dice que la aplicación todavía no puede conectarse, o Claude te pide un ID o secreto de cliente:</strong> no los necesitas. Quita el conector y vuelve a añadirlo eligiendo <strong>Register automatically</strong>.</li>
            <li><strong>Claude dice que no puede registrar o corregir partidos:</strong> puede tener guardada una lista antigua de herramientas. Empieza un chat nuevo; si sigue igual, quita el conector y vuelve a añadirlo.</li>
            <li><strong>Padelaso no responde en el chat:</strong> comprueba en el menú <strong>+</strong> → <strong>Connectors</strong> que está activado, o desconéctalo y vuelve a conectarlo.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
