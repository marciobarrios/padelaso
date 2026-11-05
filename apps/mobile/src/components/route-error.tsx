import type { ErrorBoundaryProps } from "expo-router";
import { Action, Body, Heading, Screen } from "./ui";
import { es } from "../strings";

export function RouteError({ retry }: ErrorBoundaryProps) {
  // Do not render raw errors: they can contain URLs, credentials or stack traces.
  return (
    <Screen>
      <Heading>{es.error}</Heading>
      <Body>Vuelve a intentarlo para continuar.</Body>
      <Action
        label={es.retry}
        onPress={() => {
          void retry();
        }}
      />
    </Screen>
  );
}
