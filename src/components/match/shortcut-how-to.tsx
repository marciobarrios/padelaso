"use client";

import { Card, CardContent } from "@/components/ui/card";

export function ShortcutHowTo() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3 text-sm">
        <h2 className="font-heading text-lg font-bold">
          📋 Cómo montar la Shortcut
        </h2>
        <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
          <li>
            Abre la app <strong>Atajos</strong> en tu iPhone.
          </li>
          <li>
            Crea una nueva shortcut → acción{" "}
            <strong>Obtener contenidos de URL</strong>.
          </li>
          <li>Pega la URL &ldquo;Sumar punto&rdquo; del scorekeeper.</li>
          <li>
            Método: <strong>POST</strong>. Cabecera{" "}
            <code>Content-Type: application/json</code>. Cuerpo (JSON):
            <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto">
              {`{"team":1}`}
            </pre>
            (usa <code>2</code> para el otro equipo).
          </li>
          <li>
            Ponle nombre: <em>&ldquo;Punto equipo uno&rdquo;</em>. Activa{" "}
            <strong>Añadir a Siri</strong>.
          </li>
          <li>
            Desde tu Apple Watch di{" "}
            <em>&ldquo;Oye Siri, punto equipo uno&rdquo;</em>. El resultado se
            actualiza en vivo para todos.
          </li>
        </ol>
        <p className="text-xs text-muted-foreground pt-2">
          Atajo extra: <code>{'{"team":1,"newSet":true}'}</code> abre un
          nuevo set. <code>{'{"team":1,"delta":-1}'}</code> deshace un punto.
        </p>
      </CardContent>
    </Card>
  );
}
