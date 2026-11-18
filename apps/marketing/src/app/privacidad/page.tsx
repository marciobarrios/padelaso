import type { Metadata } from "next";
import Link from "next/link";

const title = "Privacidad · Padelaso";
const description = "Cómo funcionan los datos, los permisos y los registros de las conexiones con asistentes de IA en Padelaso.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacidad" },
  openGraph: { title, description, url: "https://padelaso.com/privacidad" },
  twitter: { title, description },
};

const link = "underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus";
const heading = "font-pixel text-2xl leading-tight tracking-tight";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-ink sm:px-8 sm:py-16">
      <Link href="/" className={`${link} inline-flex min-h-11 items-center`}>← Volver a Padelaso</Link>
      <article className="mt-8 space-y-10 text-base leading-relaxed">
        <header className="space-y-4">
          <h1 className="font-pixel text-4xl leading-tight tracking-tight sm:text-5xl">Privacidad</h1>
          <p className="text-sm text-ink-soft">Actualizado el 18 de noviembre de 2026</p>
          <p>Esta primera sección de privacidad explica las conexiones de Padelaso con asistentes de inteligencia artificial mediante MCP (Model Context Protocol).</p>
        </header>

        <section aria-labelledby="clientes" className="space-y-4">
          <h2 id="clientes" className={heading}>Asistentes y clientes conectados</h2>
          <p>Conectar un cliente, como ChatGPT, es opcional. Al autorizarlo, le permites solicitar datos de Padelaso en tu nombre. Conecta solo aplicaciones de confianza. Consulta <Link href="/asistentes/chatgpt" className={link}>cómo conectar ChatGPT</Link>.</p>
          <ul className="list-disc space-y-3 pl-6">
            <li>Puede consultar los grupos a los que perteneces, sus jugadores, el historial de partidos y sus estadísticas. Esto incluye datos de otros jugadores de esos grupos, como nombres y resultados.</li>
            <li>Puede registrar partidos nuevos con sus equipos, marcadores, fecha, pista y eventos. Revisa y confirma los detalles en el cliente antes de guardarlos. Los partidos registrados aparecen en Padelaso y afectan a las estadísticas del grupo.</li>
            <li>Puede añadir eventos a partidos ya registrados. Revisa y confirma los eventos en el cliente antes de guardarlos. Aparecen en el partido y en las estadísticas del grupo.</li>
            <li>Puede quitar un evento registrado por error, de uno en uno. Revisa y confirma el evento en el cliente antes de quitarlo. Desaparece del partido y de las estadísticas del grupo.</li>
            <li>Puede corregir la fecha, la pista, los equipos o el resultado de un partido ya registrado. Revisa y confirma el cambio en el cliente antes de guardarlo. Los eventos del partido no cambian, y las estadísticas del grupo reflejan la corrección.</li>
            <li>Las herramientas actuales no permiten borrar partidos, ni cambiar o borrar jugadores o grupos. El acceso está limitado a los grupos de los que eres miembro.</li>
          </ul>
          <p>La pantalla de autorización también indica si se comparten datos de identidad, como tu correo o tu perfil, según los permisos solicitados.</p>
        </section>

        <section aria-labelledby="proveedor" className="space-y-4">
          <h2 id="proveedor" className={heading}>Qué recibe el proveedor de IA</h2>
          <p>Las respuestas a las consultas se envían al cliente que has autorizado. Su proveedor puede conservarlas junto con tus conversaciones y tratarlas según su propia política de privacidad y configuración. Consulta esas condiciones antes de conectar, incluidas sus opciones de conservación, eliminación y uso para entrenar modelos.</p>
          <p>Revocar el acceso en Padelaso no elimina los datos que el cliente ya haya recibido. Para eliminarlos, usa las opciones del proveedor o contacta con él.</p>
        </section>

        <section aria-labelledby="revocar" className="space-y-4">
          <h2 id="revocar" className={heading}>Cómo dejar de compartir datos</h2>
          <p>Puedes desconectar Padelaso desde la configuración de conectores o integraciones de tu asistente. Esto deja de usar la conexión en ese cliente; no garantiza que se haya revocado el permiso en Padelaso.</p>
          <p>Para revocar el permiso en Padelaso, abre <a href="https://app.padelaso.com/settings" className={link}>Ajustes de Padelaso</a>, busca el cliente en la sección Integraciones, pulsa Desconectar y confirma la desconexión.</p>
          <p>Al revocar el permiso, el cliente deja de poder renovar su acceso. Un acceso ya emitido puede seguir funcionando hasta una hora, hasta que caduque. Para volver a conectar después tendrás que autorizarlo de nuevo.</p>
        </section>

        <section aria-labelledby="registros" className="space-y-4">
          <h2 id="registros" className={heading}>Qué registramos de las llamadas MCP</h2>
          <p>Para supervisar el funcionamiento y detectar errores o abusos, registramos el identificador del usuario y del cliente, el nombre de la herramienta, el resultado de la llamada (correcto, denegado o error) y su duración.</p>
          <p>El registro específico de llamadas a herramientas no incluye los argumentos ni las respuestas, los marcadores, los nombres de jugadores, las conversaciones ni los tokens de acceso. Los nombres de herramientas desconocidas se registran como desconocidos.</p>
          <p>Los fallos inesperados de ejecución o validación de respuestas se notifican a Sentry con la herramienta y el identificador del cliente, sin el error original, los argumentos, las respuestas, los tokens ni el contexto de la petición. Los rechazos esperados de entrada o permisos no se notifican como errores a Sentry.</p>
        </section>
      </article>
    </main>
  );
}
