import { router, useLocalSearchParams } from "expo-router";
import { Action, Body, Card, Heading, Screen } from "../../components/ui";
import { sampleEvents, sampleMatch, teamNames } from "../../sample";
import { es } from "../../strings";
import { useAuth } from "../../auth/provider";
import { LinkedMatch } from "../../auth/linked-match";

export { RouteError as ErrorBoundary } from "../../components/route-error";

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  if (state.session) return <LinkedMatch key={id} id={id} />;
  if (id !== sampleMatch.id)
    return (
      <Screen>
        <Heading>{es.missing}</Heading>
        <Action label={es.back} onPress={() => router.replace("/")} />
      </Screen>
    );
  return (
    <Screen>
      <Body muted>
        {es.sample} · {es.court}
      </Body>
      <Heading>{teamNames[0]}</Heading>
      <Body>contra {teamNames[1]}</Body>
      <Card>
        <Heading>{es.result}</Heading>
        {sampleMatch.sets.map((set, index) => (
          <Body key={index}>
            Set {index + 1}: {set.team1Score} – {set.team2Score}
          </Body>
        ))}
      </Card>
      <Card>
        <Heading>{es.events}</Heading>
        {sampleEvents.map((event) => (
          <Body key={event.type}>
            {event.emoji} {event.label}
          </Body>
        ))}
      </Card>
    </Screen>
  );
}
