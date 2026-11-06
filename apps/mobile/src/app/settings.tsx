import { useState } from "react";
import { Platform } from "react-native";
import { watchSpike } from "../../modules/watch-spike";
import { Action, Body, Card, Heading, Screen } from "../components/ui";
import { settings } from "../config/settings";
import { es } from "../strings";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function SettingsScreen() {
  const [watchError, setWatchError] = useState(false);
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
      {Platform.OS === "ios" && (
        <Card>
          <Body>Prueba de Apple Watch · MAR-44</Body>
          <Body muted>Configura un partido de prueba en el formulario nativo.</Body>
          <Action
            label="Preparar prueba del Watch"
            onPress={async () => {
              setWatchError(false);
              try {
                if (!watchSpike) throw new Error("Native module unavailable");
                await watchSpike.openSetup();
              } catch {
                setWatchError(true);
              }
            }}
          />
          {watchError && (
            <Body>No se pudo abrir la prueba. Instala una compilación nativa con el módulo del Watch.</Body>
          )}
        </Card>
      )}
    </Screen>
  );
}
