import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAllowedMcpClient, isAllowedMcpUser } from "@/lib/mcp/config";
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
];
// The grant is a full account token, so this describes the connection's tools
// and never promises that the application is unable to write.
const NOT_OFFERED = ["Esta conexión solo ofrece consultas: no incluye herramientas para crear, editar ni borrar"];

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
  const canApprove = isAllowedMcpUser(user.id) && isAllowedMcpClient(details.client.id);

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
            <h2 className="text-sm font-medium">Si lo permites, podrá:</h2>
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
                También recibirá: {identity.join(", ").toLowerCase()}.
              </p>
            )}
          </div>
          <div className="space-y-2 text-xs text-muted-foreground text-pretty">
            <p>
              El permiso se concede con los mismos derechos que tu cuenta de Padelaso, aunque esta conexión solo ofrezca consultas.
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
          Las conexiones con asistentes están en pruebas y todavía no están disponibles para tu cuenta.
        </p>
      )}

      <ConsentForm authorizationId={authorizationId} canApprove={canApprove} />
    </Shell>
  );
}
