import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canUseMcpClient } from "@/lib/mcp/client-admission";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { describeScopes, isSafeClientRedirect, loginPath, parseAuthorizationId } from "./_lib";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = {
  title: "Autorizar acceso · Padelaso",
  robots: { index: false },
};

const CAN = [
  "Ver los grupos a los que perteneces",
  "Consultar los jugadores, el historial de partidos y las estadísticas de esos grupos",
  "Registrar partidos nuevos en esos grupos, añadir eventos a partidos ya registrados y corregir su fecha, pista, equipos o resultado, después de que confirmes los detalles",
  "Quitar un evento registrado por error, de uno en uno, después de que confirmes cuál",
];
// The grant is a full account token, so this describes the connection's tools
// and never promises that the application is unable to do more.
const NOT_OFFERED = ["No incluye herramientas para borrar partidos, ni cambiar ni borrar jugadores o grupos"];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <section
        aria-labelledby="consent-title"
        className="w-full max-w-md space-y-6 rounded-4xl bg-card p-6 text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10"
      >
        <p className="font-heading text-xs tracking-widest text-muted-foreground">PADELASO</p>
        {children}
      </section>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <h1 id="consent-title" className="font-heading text-2xl font-bold text-balance">{title}</h1>
      <p role="alert" className="text-muted-foreground text-pretty">{children}</p>
      <Button size="lg" render={<Link href="/" />}>Ir a Padelaso</Button>
    </Shell>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[]; error?: string }>;
}) {
  const params = await searchParams;
  if (params.error === "expired") {
    return (
      <Notice title="La solicitud ha caducado">
        Vuelve a iniciar la conexión desde la aplicación que quieres conectar.
      </Notice>
    );
  }
  const authorizationId = parseAuthorizationId(params.authorization_id);
  if (!authorizationId) {
    return (
      <Notice title="Enlace no válido">
        Este enlace de autorización no es válido. Vuelve a iniciar la conexión desde la aplicación que quieres conectar.
      </Notice>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(loginPath(authorizationId));

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return (
      <Notice title="La solicitud ha caducado">
        Esta solicitud ya no es válida o ya se ha usado. Vuelve a iniciar la conexión desde la aplicación que quieres conectar.
      </Notice>
    );
  }
  // Supabase skips consent for a client the user already approved with these scopes.
  if (!("authorization_id" in details)) {
    if (!isSafeClientRedirect(details.redirect_url)) redirect("/oauth/consent?error=expired");
    redirect(details.redirect_url);
  }

  const clientName = details.client.name?.trim() || "Una aplicación";
  const destination = hostOf(details.redirect_uri);
  const identity = describeScopes(details.scope);
  const canApprove = await canUseMcpClient(details.client.id);

  return (
    <Shell>
      <div className="space-y-2">
        <h1 id="consent-title" className="font-heading text-2xl font-bold text-balance">
          {clientName} quiere acceder a tu cuenta
        </h1>
        <p className="text-sm text-muted-foreground">
          Has iniciado sesión como <span className="font-medium text-foreground">{details.user.email || user.email}</span>.
        </p>
      </div>

      {canApprove ? (
        <>
          <div className="space-y-3">
            <h2 className="text-sm font-medium">Permiso: leer y registrar partidos</h2>
            <ul className="space-y-2 text-sm">
              {CAN.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
              {NOT_OFFERED.map((item) => (
                <li key={item} className="flex gap-2 text-muted-foreground">
                  <X aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {identity.length > 0 && (
              <p className="text-xs text-muted-foreground">
                También recibirá: {identity.join(", ")}.
              </p>
            )}
          </div>
          <div className="space-y-2 text-xs text-muted-foreground text-pretty">
            <p>
              Esta conexión permite leer los datos de tus grupos, registrar partidos, añadirles eventos, quitar eventos y corregirlos.
            </p>
            <p>Si se revoca el permiso, un acceso ya emitido puede seguir funcionando hasta una hora.</p>
            {destination && (
              <p>
                Al continuar volverás a <span className="font-medium text-foreground">{destination}</span>. Permite el acceso solo si has iniciado tú esta conexión.
              </p>
            )}
          </div>
        </>
      ) : (
        <p role="alert" className="text-muted-foreground text-pretty">
          Esta aplicación todavía no puede conectarse a Padelaso.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Consulta cómo se comparten tus datos y cómo revocar el acceso en la{" "}
        <a href="https://padelaso.com/privacidad" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
          política de privacidad (se abre en otra pestaña)
        </a>.
      </p>
      <ConsentForm authorizationId={authorizationId} canApprove={canApprove} />
    </Shell>
  );
}
