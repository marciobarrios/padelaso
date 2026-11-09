import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Action, Body, Heading, Screen } from "../../components/ui";
import { supabase } from "../../auth/client";
import { useAuth } from "../../auth/provider";
import { pendingPath } from "../../auth/links";

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { state, controller } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const valid = !!pendingPath(`/join/${code}`) && !!state.session;
  async function accept() {
    if (!supabase || !valid || busy) return;
    setBusy(true);
    try {
      // Explicit user action; this existing RPC validates the invitation and
      // grants member (never admin) access. Merely opening a URL cannot join.
      const { data, error } = await supabase.rpc("join_group_by_code", {
        code,
      });
      if (!alive.current) return;
      if (error || !data) {
        setMessage(
          "No pudimos aceptar la invitación. Comprueba el enlace y la conexión antes de volver a intentarlo.",
        );
        return;
      }
      await controller?.dismissPending();
      if (alive.current) setMessage(`Ya formas parte de ${data.name}.`);
    } catch {
      if (alive.current)
        setMessage(
          "No pudimos confirmar la invitación. Revisa tus grupos antes de reintentar.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading>Invitación a un grupo</Heading>
      <Body>
        {valid
          ? `Aceptarás la invitación con ${state.session?.user.email ?? "tu cuenta actual"}.`
          : "Esta invitación no es válida. Inicia sesión y abre de nuevo el enlace."}
      </Body>
      {valid && (
        <Action
          label="Aceptar invitación"
          disabled={busy || !!message?.startsWith("Ya formas")}
          onPress={() => {
            void accept();
          }}
        />
      )}
      {message && <Body>{message}</Body>}
      <Action
        label="Volver a mi cuenta"
        disabled={busy}
        onPress={() => {
          void controller?.dismissPending().then(() => router.replace("/"));
        }}
      />
    </Screen>
  );
}
