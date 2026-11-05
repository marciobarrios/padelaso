import { Body, Card, Heading, Screen } from "../components/ui";
import { settings } from "../config/settings";
import { es } from "../strings";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function SettingsScreen() {
  return (
    <Screen>
      <Heading>{es.settings}</Heading>
      <Card>
        {settings.status === "invalid" ? (
          <Body>{es.backendInvalid}</Body>
        ) : (
          <>
            <Body>
              {es.environment}: {es[settings.environment]}
            </Body>
            <Body>
              {settings.status === "configured"
                ? es.backendReady
                : es.backendSample}
            </Body>
          </>
        )}
      </Card>
      <Body muted>{es.settingsHint}</Body>
    </Screen>
  );
}
