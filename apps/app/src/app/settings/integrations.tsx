"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { getBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import type { OAuthGrant } from "@supabase/supabase-js";

const REVOCATION_NOTE = "Al desconectar, la aplicación no podrá renovar su acceso. El acceso que ya tiene puede durar hasta 1 hora.";

export function Integrations() {
  const { user } = useAuth();
  const { data: grants, error, isLoading, mutate } = useSWR(
    user ? ["oauth-grants", user.id] : null,
    async () => {
      const result = await getBrowserClient().auth.oauth.listGrants();
      if (result.error) throw result.error;
      return result.data;
    }
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<OAuthGrant | null>(null);
  const [pending, setPending] = useState(false);
  const [revokeError, setRevokeError] = useState(false);
  const [message, setMessage] = useState("");

  async function revoke() {
    if (!selected || pending) return;
    setPending(true);
    setRevokeError(false);
    try {
      const result = await getBrowserClient().auth.oauth.revokeGrant({ clientId: selected.client.id });
      if (result.error) throw result.error;
      await mutate((current) => current?.filter((grant) => grant.client.id !== selected.client.id), { revalidate: false });
      setMessage(`${selected.client.name || "Aplicación"} desconectada. Su acceso puede durar hasta 1 hora.`);
      dialog.current?.close();
    } catch {
      setRevokeError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="integrations-title" className="space-y-4">
      <div className="space-y-2">
        <h2 id="integrations-title" className="text-xl font-bold font-heading">Integraciones</h2>
        <p className="text-sm text-muted-foreground">Aplicaciones de IA conectadas a tu cuenta de Padelaso.</p>
        <p className="text-sm text-muted-foreground">{REVOCATION_NOTE}</p>
      </div>
      {(!user || isLoading) && <p role="status">Cargando conexiones…</p>}
      {error && <div role="alert" className="space-y-2"><p>No se pudieron cargar las conexiones.</p><Button variant="outline" onClick={() => void mutate()}>Reintentar</Button></div>}
      {grants?.length === 0 && <div className="rounded-xl border border-border p-5 text-center space-y-2"><p className="font-bold">Sin aplicaciones conectadas</p><p className="text-sm text-muted-foreground">Cuando conectes una aplicación de IA, aparecerá aquí.</p></div>}
      {grants && grants.length > 0 && <ul className="space-y-3">{grants.map((grant) => <li key={grant.client.id} className="rounded-xl border border-border p-4 space-y-3">
        <p className="font-bold break-words">{grant.client.name || "Aplicación"}</p>
        <Button variant="destructive" className="min-h-11" onClick={() => {
          setSelected(grant);
          setRevokeError(false);
          dialog.current?.showModal();
        }}>Desconectar<span className="sr-only"> {grant.client.name || "aplicación"}</span></Button>
      </li>)}</ul>}
      <p role="status" className="text-sm">{message}</p>
      <dialog ref={dialog} aria-labelledby="revoke-title" aria-describedby="revoke-description" onCancel={(event) => { if (pending) event.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-background text-foreground p-5 backdrop:bg-black/50">
        <h2 id="revoke-title" className="text-lg font-bold break-words">¿Desconectar {selected?.client.name || "aplicación"}?</h2>
        <p id="revoke-description" className="text-sm text-muted-foreground my-4">{REVOCATION_NOTE}</p>
        {revokeError && <p role="alert" className="text-sm mb-4">No se pudo desconectar. Inténtalo de nuevo.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button autoFocus variant="outline" className="min-h-11" disabled={pending} onClick={() => dialog.current?.close()}>Cancelar</Button>
          <Button variant="destructive" className="min-h-11" disabled={pending} onClick={() => void revoke()}>{pending ? "Desconectando…" : "Desconectar"}</Button>
        </div>
      </dialog>
    </section>
  );
}
