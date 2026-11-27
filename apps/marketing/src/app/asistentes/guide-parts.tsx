import Link from "next/link";
import { GuideLink } from "./from-app";

export const mcpUrl = "https://app.padelaso.com/api/mcp";
export const link = "underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus";
export const heading = "font-pixel text-2xl leading-tight tracking-tight";

/** Requests worth trying right after connecting. `prefix` is how the client calls Padelaso in a chat (e.g. "@Padelaso "). */
export function ExamplesSection({ prefix = "" }: { prefix?: string }) {
  const examples = [
    "Enséñame los últimos partidos de mi grupo.",
    "¿Cuáles son mis estadísticas este año? ¿Con quién gano más?",
    "¿Quién va primero en el ranking del grupo?",
    "Registra un partido: Ana y yo ganamos a Luis y Marta 6-4, 3-6, 7-5.",
    "Añade dos aces de Ana al partido de ayer.",
    "Quita la doble falta de Luis del último partido, fue un error.",
    "Corrige el partido de ayer: el segundo set fue 6-3, no 6-4.",
  ];
  return (
    <section aria-labelledby="ejemplos" className="space-y-4">
      <h2 id="ejemplos" className={heading}>Prueba a pedirle</h2>
      <ul className="space-y-2">
        {examples.map((example) => (
          <li key={example} className="rounded-sm border border-line bg-card px-4 py-3">{prefix}{example}</li>
        ))}
      </ul>
      <p className="text-sm text-ink-soft">Si perteneces a varios grupos, dile en cuál quieres consultar o registrar. Cómo registra un partido y qué reglas sigue: <GuideLink href="/asistentes" className={link}>Padelaso en tu asistente de IA</GuideLink>.</p>
    </section>
  );
}

/** The single scope Padelaso grants, which is the same for every client. */
export function PermissionSection({ client }: { client: string }) {
  return (
    <section aria-labelledby="permiso" className="space-y-4">
      <h2 id="permiso" className={heading}>Qué permiso das</h2>
      <p>Padelaso pide un único permiso: <strong>leer y registrar partidos</strong>. Con él, {client} puede:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>Ver los grupos a los que perteneces.</li>
        <li>Consultar los jugadores, el historial de partidos y las estadísticas de esos grupos.</li>
        <li>Registrar partidos nuevos en esos grupos, añadir eventos a partidos ya registrados y corregir su fecha, pista, equipos o resultado. {client} te pide confirmar los detalles antes de guardarlos.</li>
        <li>Quitar un evento registrado por error, de uno en uno. {client} te pide confirmar cuál antes de quitarlo.</li>
      </ul>
      <p>Las herramientas actuales no permiten borrar partidos, ni cambiar o borrar jugadores o grupos. El acceso está limitado a los grupos de los que eres miembro. Más detalles en <Link href="/privacidad" className={link}>Privacidad</Link>.</p>
    </section>
  );
}
