"use client";

import { Card, CardContent } from "@/components/ui/card";

export function ShortcutHowTo() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3 text-sm">
        <h2 className="font-heading text-lg font-bold">
          📋 Cómo montar la Shortcut
        </h2>
        <p className="text-xs text-muted-foreground">
          Necesitas <strong>2 Shortcuts</strong>: una por equipo. Configúralos
          una vez y se reutilizan en todos tus partidos (basta con pegar la
          URL nueva cada vez).
        </p>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            1. Shortcut &ldquo;Punto equipo uno&rdquo;
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>
              Abre <strong>Atajos</strong> en tu iPhone → nueva shortcut →
              acción <strong>Obtener contenidos de URL</strong>.
            </li>
            <li>
              <strong>URL</strong>: pega la URL del botón{" "}
              <em>&ldquo;Copiar URL (Shortcut)&rdquo;</em> de arriba (ya
              incluye el token como query param).
            </li>
            <li>
              Abre <strong>Mostrar más</strong> en la acción:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                <li>
                  <strong>Método</strong>: <code>POST</code>
                </li>
                <li>
                  <strong>Cabeceras</strong>:{" "}
                  <code>Content-Type: application/json</code>
                </li>
                <li>
                  <strong>Cuerpo de la solicitud</strong>: selecciona{" "}
                  <em>JSON</em> y añade el campo{" "}
                  <code>team</code> con el valor numérico <code>1</code>.
                </li>
              </ul>
            </li>
            <li>
              Arriba del todo ponle el nombre{" "}
              <em>&ldquo;Punto equipo uno&rdquo;</em> y activa{" "}
              <strong>Añadir a Siri</strong> con esa frase.
            </li>
          </ol>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            2. Shortcut &ldquo;Punto equipo dos&rdquo;
          </p>
          <ol
            className="list-decimal list-inside space-y-1.5 text-muted-foreground"
            start={5}
          >
            <li>
              Desde la lista de Shortcuts, mantén pulsada la del equipo 1 →{" "}
              <strong>Duplicar</strong>.
            </li>
            <li>
              Abre la copia y cambia sólo el cuerpo:{" "}
              <code>team</code> = <code>2</code>. Renómbrala a{" "}
              <em>&ldquo;Punto equipo dos&rdquo;</em> y actualiza la frase de
              Siri.
            </li>
          </ol>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            3. Úsala desde el Apple Watch
          </p>
          <p className="text-muted-foreground">
            Di <em>&ldquo;Oye Siri, punto equipo uno&rdquo;</em>. El resultado
            se actualiza en vivo para todos los que miran el partido.
          </p>
        </div>

        <p className="text-xs text-muted-foreground pt-2">
          <strong>Extras opcionales</strong> (duplica más Shortcuts): para
          abrir un set nuevo añade <code>newSet = true</code> al cuerpo; para
          deshacer un punto usa <code>delta = -1</code>.
        </p>

        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            4. Shortcut para eventos (opcional)
          </p>
          <p className="text-xs text-muted-foreground mb-2">
            Si quieres gritarle a Siri <em>&ldquo;víbora Marcio&rdquo;</em>{" "}
            mientras juegas, puedes montar una Shortcut por cada combinación
            habitual de jugador + evento. La URL de eventos y el UUID del
            jugador los encuentras en el scorekeeper.
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
            <li>
              Copia la URL del bloque{" "}
              <em>&ldquo;Registrar evento&rdquo;</em> de arriba.
            </li>
            <li>
              Consigue el <strong>UUID</strong> del jugador: en la app, abre
              su perfil — el UUID está en la URL después de{" "}
              <code>/players/</code>.
            </li>
            <li>
              Nueva shortcut → <strong>Obtener contenidos de URL</strong> →
              pega la URL. En <strong>Mostrar más</strong>:
              <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                <li>
                  <strong>Método</strong>: <code>POST</code>
                </li>
                <li>
                  <strong>Cabeceras</strong>:{" "}
                  <code>Content-Type: application/json</code>
                </li>
                <li>
                  <strong>Cuerpo</strong> (JSON): campo{" "}
                  <code>playerId</code> con el UUID del jugador y campo{" "}
                  <code>type</code> con el nombre del evento (por ejemplo{" "}
                  <code>vibora</code>, <code>ace</code>,{" "}
                  <code>bandeja</code>, <code>bola_fuera</code>…).
                </li>
              </ul>
            </li>
            <li>
              Renómbrala (p. ej. <em>&ldquo;Víbora Marcio&rdquo;</em>) y
              actívala con <strong>Añadir a Siri</strong>.
            </li>
            <li>
              Para más combinaciones: duplica la shortcut y cambia sólo el{" "}
              <code>playerId</code> o el <code>type</code>.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground pt-2">
            <strong>Alternativa más rápida</strong>: registra los eventos
            desde el scorer en pantalla grande — la fila inferior tiene los
            26 eventos ordenados por los más usados por tu grupo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
