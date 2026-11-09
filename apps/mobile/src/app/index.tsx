import { router } from "expo-router";
import { Action, Body, Card, Heading, Screen } from "../components/ui";
import { teamNames, setWins } from "../sample";
import { es } from "../strings";
import { useAuth } from "../auth/provider";
import { AccountHome } from "../auth/account-home";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function MatchesScreen() {
  const { state } = useAuth();
  if (state.session) return <AccountHome />;
  return (
    <Screen>
      <Heading>{es.subtitle}</Heading>
      <Body muted>{es.sampleHint}</Body>
      <Card>
        <Body muted>
          {es.sample} · {es.court}
        </Body>
        <Heading>
          {setWins.team1Wins} – {setWins.team2Wins}
        </Heading>
        <Body>{teamNames[0]}</Body>
        <Body>{teamNames[1]}</Body>
        <Action
          label={es.openMatch}
          onPress={() => router.push("/matches/ejemplo")}
        />
      </Card>
      <Action label={es.settings} onPress={() => router.push("/settings")} />
    </Screen>
  );
}
