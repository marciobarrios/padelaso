import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { allowed } from "@/lib/mcp/auth";
import { Button } from "@/components/ui/button";

const authorizationId = z.uuid();

async function authorization(id: string) {
  const client = await createServerSupabaseClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  if (!allowed(process.env.MCP_ALLOWED_USER_IDS, user.id)) return null;
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return null;
  if ("client" in data && !allowed(process.env.MCP_ALLOWED_CLIENT_IDS, data.client.id)) return null;
  return { client, data };
}

async function decide(form: FormData) {
  "use server";
  const id = authorizationId.safeParse(form.get("authorization_id"));
  const decision = z.enum(["approve", "deny"]).safeParse(form.get("decision"));
  if (!id.success || !decision.success) redirect("/oauth/consent?error=invalid");
  const auth = await authorization(id.data);
  if (!auth || !("client" in auth.data)) redirect("/oauth/consent?error=expired");
  const method = decision.data === "approve" ? "approveAuthorization" : "denyAuthorization";
  const { data, error } = await auth.client.auth.oauth[method](id.data, { skipBrowserRedirect: true });
  if (error || !data) redirect("/oauth/consent?error=expired");
  redirect(data.redirect_url);
}

export default async function ConsentPage({ searchParams }: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const params = await searchParams;
  const id = authorizationId.safeParse(params.authorization_id);
  const auth = id.success && !params.error ? await authorization(id.data) : null;
  if (auth && "redirect_url" in auth.data) redirect(auth.data.redirect_url);
  const details = auth && "client" in auth.data ? auth.data : null;
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <section className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm" aria-labelledby="consent-title">
        <p className="font-heading text-sm text-muted-foreground">PADELASO · CONEXIONES</p>
        <h1 id="consent-title" className="text-2xl font-bold">{details ? `Conectar ${details.client.name || "aplicación"}` : "No se puede conectar"}</h1>
        {details ? <>
          <p>Esta aplicación solicita permiso para leer y registrar partidos en tu nombre.</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Durante esta fase podrá consultar tus grupos, jugadores, historial y estadísticas. Solo verá los grupos a los que perteneces.</p>
            <p>El permiso de Supabase también permite acceder a tus datos con los mismos permisos de tu cuenta. La conexión MCP solo ofrece consultas por ahora.</p>
            {details.scope && <p>Acceso de identidad solicitado: {details.scope}</p>}
            <p>Al revocar el permiso, un token ya emitido puede seguir funcionando hasta una hora.</p>
          </div>
          <form action={decide} className="flex flex-wrap gap-3">
            <input type="hidden" name="authorization_id" value={id.data} />
            <Button type="submit" name="decision" value="approve">Permitir acceso</Button>
            <Button type="submit" name="decision" value="deny" variant="outline">Denegar</Button>
          </form>
        </> : <>
          <p role="alert" className="text-muted-foreground">La solicitud no es válida, ha caducado o esta conexión todavía no tiene acceso. Vuelve a iniciar la conexión desde tu aplicación.</p>
          <Button render={<Link href="/" />}>Volver a Padelaso</Button>
        </>}
      </section>
    </main>
  );
}
