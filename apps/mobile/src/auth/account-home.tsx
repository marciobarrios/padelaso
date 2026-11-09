import { useEffect, useState } from "react";
import { Redirect, router, type Href } from "expo-router";
import { Action, Body, Card, Heading, Screen } from "../components/ui";
import { supabase } from "./client";
import { useAuth } from "./provider";
import { authMessages } from "./messages";

type Group = { id: string; name: string; emoji: string };
type Player = { id: string; name: string; group_id: string };

export function AccountHome() {
  const { state } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const userId = state.session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    const abort = new AbortController();
    void Promise.all([
      client.from("groups").select("id,name,emoji").abortSignal(abort.signal),
      client
        .from("players")
        .select("id,name,group_id")
        .eq("user_id", userId)
        .abortSignal(abort.signal),
    ])
      .then(([groupResult, playerResult]) => {
        if (abort.signal.aborted) return;
        if (groupResult.error || playerResult.error) {
          setFailed(true);
          return;
        }
        setGroups(groupResult.data);
        setPlayers(playerResult.data);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [userId, attempt]);
  if (state.pending) return <Redirect href={state.pending as Href} />;
  return (
    <Screen>
      <Heading>Tu cuenta de Padelaso</Heading>
      <Body>{state.session?.user.email ?? "Sesión iniciada"}</Body>
      {failed ? (
        <>
          <Body>No pudimos cargar tus grupos. Revisa la conexión.</Body>
          <Action
            label="Reintentar"
            onPress={() => {
              setFailed(false);
              setGroups(null);
              setPlayers([]);
              setAttempt((value) => value + 1);
            }}
          />
        </>
      ) : groups === null ? (
        <Body>Cargando tus grupos…</Body>
      ) : groups.length === 0 ? (
        <>
          <Body>
            Aún no hay grupos en esta cuenta. Si eres nuevo, abre una invitación
            de tu grupo.
          </Body>
          <Body muted>{authMessages.recovery}</Body>
        </>
      ) : (
        groups.map((group) => (
          <Card key={group.id}>
            <Heading>
              {group.emoji} {group.name}
            </Heading>
            <Body>
              {players.find((player) => player.group_id === group.id)?.name ??
                "Todavía no tienes un jugador asociado en este grupo."}
            </Body>
          </Card>
        ))
      )}
      <Action
        label="Configuración de la cuenta"
        onPress={() => router.push("/settings")}
      />
    </Screen>
  );
}
