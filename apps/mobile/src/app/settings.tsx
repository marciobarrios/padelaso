import { useState } from "react";
import { Platform } from "react-native";
import { watchSpike } from "../../modules/watch-spike";
import { Action, Body, Card, Heading, Screen } from "../components/ui";
import { settings } from "../config/settings";
import { es } from "../strings";
import { useAuth } from "../auth/provider";
import { AccountActions } from "../auth/account-actions";
import { authMessages } from "../auth/messages";

export { RouteError as ErrorBoundary } from "../components/route-error";

export default function SettingsScreen() {
  const { state, controller } = useAuth();
  const [watchError, setWatchError] = useState(false);
  return (
    <Screen>
      <Heading>{es.settings}</Heading>
      {state.session && (
        <Card>
          <Body>{state.session.user.email ?? "Cuenta de Padelaso"}</Body>
          <Body muted>
            Proveedores:{" "}
            {state.session.user.identities
              ?.map((identity) => identity.provider)
              .join(", ")}
          </Body>
          <Body muted>{authMessages.recovery}</Body>
          <AccountActions link />
          <Action
            label="Cerrar sesión"
            disabled={state.busy}
            onPress={() => {
              void controller?.signOut();
            }}
          />
        </Card>
      )}
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
      {Platform.OS === "ios" && settings.status === "sample" && (
        <Card>
          <Body>Prueba de Apple Watch · MAR-44</Body>
          <Body muted>
            Configura un partido de prueba en el formulario nativo.
          </Body>
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
            <Body>
              No se pudo abrir la prueba. Instala una compilación nativa con el
              módulo del Watch.
            </Body>
          )}
        </Card>
      )}
    </Screen>
  );
}
