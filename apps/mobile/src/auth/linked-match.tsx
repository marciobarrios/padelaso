import { useEffect, useState } from "react";
import { router } from "expo-router";
import { mapMatch } from "@padelaso/data/mappers";
import type { Match } from "@padelaso/domain/types";
import { Action, Body, Card, Heading, Screen } from "../components/ui";
import { useAuth } from "./provider";
import { supabase } from "./client";
import { pendingPath } from "./links";

export function LinkedMatch({ id }: { id: string }) {
  const { controller, state } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [status, setStatus] = useState<
    "loading" | "missing" | "failed" | "ready"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const valid = !!supabase && !!pendingPath(`/matches/${id}`);
  useEffect(() => {
    const abort = new AbortController();
    if (!supabase || !valid) return;
    // No optimistic data: a valid UUID is not authorization. RLS decides access.
    void supabase
      .from("matches")
      .select("*")
      .eq("id", id)
      .abortSignal(abort.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (abort.signal.aborted) return;
        if (error) {
          setStatus("failed");
          return;
        }
        if (!data) {
          setStatus("missing");
          return;
        }
        try {
          setMatch(mapMatch(data));
          setStatus("ready");
        } catch {
          setStatus("failed");
        }
      });
    return () => abort.abort();
  }, [id, valid, state.session?.user.id, attempt]);
  const back = async () => {
    await controller?.dismissPending();
    router.replace("/");
  };
  return (
    <Screen>
      <Heading>Partido</Heading>
      {valid && status === "loading" && (
        <Body>Comprobando acceso al partido…</Body>
      )}
      {(!valid || status === "missing") && (
        <Body>El partido no existe o tu cuenta no tiene acceso.</Body>
      )}
      {status === "failed" && (
        <>
          <Body>No pudimos comprobar el partido.</Body>
          <Action
            label="Reintentar"
            onPress={() => {
              setMatch(null);
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          />
        </>
      )}
      {match && (
        <Card>
          <Body>
            {String(match.date)}
            {match.courtNumber ? ` · Pista ${match.courtNumber}` : ""}
          </Body>
          {match.sets.map((set, index) => (
            <Body key={index}>
              Set {index + 1}: {set.team1Score} – {set.team2Score}
            </Body>
          ))}
          {match.sets.length === 0 && (
            <Body>El partido aún no tiene resultado.</Body>
          )}
        </Card>
      )}
      <Action
        label="Volver a mi cuenta"
        onPress={() => {
          void back();
        }}
      />
    </Screen>
  );
}
