import { router } from "expo-router";
import { Action, Heading, Screen } from "../components/ui";
import { es } from "../strings";

export default function NotFound() {
  return (
    <Screen>
      <Heading>{es.missing}</Heading>
      <Action label={es.back} onPress={() => router.replace("/")} />
    </Screen>
  );
}
