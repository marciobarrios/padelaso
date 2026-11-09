import { router } from "expo-router";
import { Action, Body, Heading, Screen } from "../components/ui";
import { AccountActions } from "../auth/account-actions";
import { useAuth } from "../auth/provider";
import { settings } from "../config/settings";

export default function SignInScreen() {
  const { state, controller } = useAuth();
  return (
    <Screen>
      <Heading>Tu cuenta, tus partidos.</Heading>
      {settings.status !== "configured" ? (
        <>
          <Body>
            {settings.status === "invalid"
              ? "Revisa la configuración pública del entorno."
              : "Estás en el modo de ejemplo. Configura un backend para iniciar sesión."}
          </Body>
          {settings.status === "sample" && (
            <Action
              label="Explorar ejemplo"
              onPress={() => router.replace("/")}
            />
          )}
        </>
      ) : state.status === "loading" ? (
        <Body>Recuperando tu sesión…</Body>
      ) : (
        <>
          {state.pending && (
            <Body>
              Guardamos tu enlace. Podrás continuar después de entrar con tu
              cuenta.
            </Body>
          )}
          {state.status === "error" ? (
            <>
              <Body>{state.message}</Body>
              <Action
                label="Comprobar sesión"
                disabled={state.busy}
                onPress={() => {
                  void controller?.validate();
                }}
              />
              <Action
                label="Cerrar sesión en este dispositivo"
                disabled={state.busy}
                onPress={() => {
                  void controller?.signOut();
                }}
              />
            </>
          ) : (
            <AccountActions />
          )}
        </>
      )}
    </Screen>
  );
}
