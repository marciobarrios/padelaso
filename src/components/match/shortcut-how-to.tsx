"use client";

import { Card, CardContent } from "@/components/ui/card";

export function ShortcutHowTo() {
  return (
    <Card>
      <CardContent className="p-5 space-y-4 text-sm">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">
            📋 Cómo montar la Shortcut
          </h2>
          <p className="text-xs text-muted-foreground">
            Una vez la primera vez. Después, sólo pegas la URL nueva al
            regenerar el token de cada partido.
          </p>
        </div>

        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            1 · Atajo &ldquo;Punto equipo uno&rdquo;
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground marker:text-foreground/60">
            <li>
              iPhone → <strong>Atajos</strong> → <strong>+</strong> nuevo →
              acción <strong>Obtener contenidos de URL</strong>.
            </li>
            <li>
              <strong>URL</strong>: pega lo que copiaste con{" "}
              <em>Copiar URL (Shortcut)</em>.
            </li>
            <li>
              Toca <strong>Mostrar más</strong> y deja la acción así:
              <ul className="mt-1.5 ml-4 space-y-1 text-xs">
                <li>
                  <code className="text-foreground">Método</code> ·{" "}
                  <code>POST</code>
                </li>
                <li>
                  <code className="text-foreground">Cabeceras</code> ·{" "}
                  <code>Content-Type</code> = <code>application/json</code>
                </li>
                <li>
                  <code className="text-foreground">Cuerpo</code> · tipo{" "}
                  <em>JSON</em>, campo <code>team</code> con valor{" "}
                  <code>1</code> (Número).
                </li>
              </ul>
            </li>
            <li>
              Arriba ponle el nombre <em>&ldquo;Punto equipo uno&rdquo;</em> y
              activa <strong>Añadir a Siri</strong> con esa misma frase.
            </li>
          </ol>
        </section>

        <section className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            2 · Atajo &ldquo;Punto equipo dos&rdquo;
          </p>
          <p className="text-muted-foreground">
            Mantén pulsado el atajo anterior → <strong>Duplicar</strong>. En la
            copia cambia <code>team</code> a <code>2</code>, renómbralo{" "}
            <em>&ldquo;Punto equipo dos&rdquo;</em> y vuelve a activar Siri.
          </p>
        </section>

        <section className="space-y-1.5 pt-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            3 · Úsalo
          </p>
          <p className="text-muted-foreground">
            Di <em>&ldquo;Oye Siri, punto equipo uno&rdquo;</em> desde iPhone,
            Watch o AirPods. El marcador se actualiza en vivo para todos.
          </p>
        </section>

        <section className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Extras opcionales</p>
          <p>
            En el cuerpo JSON de cualquier copia: <code>delta</code> ={" "}
            <code>-1</code> deshace un punto, <code>newSet</code> ={" "}
            <code>true</code> abre un set nuevo.
          </p>
        </section>

        <details className="group border-t border-border pt-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-muted-foreground select-none">
            Atajo para eventos por voz (avanzado)
          </summary>
          <div className="space-y-2 pt-2 text-muted-foreground">
            <p>
              Para gritarle <em>&ldquo;víbora Marcio&rdquo;</em> a Siri,
              necesitas un atajo por combinación habitual de jugador + evento.
              Misma receta que arriba con dos diferencias:
            </p>
            <ul className="ml-4 space-y-1 text-xs">
              <li>
                <strong>URL</strong>: la del bloque{" "}
                <em>Registrar evento</em>.
              </li>
              <li>
                <strong>Cuerpo</strong> (JSON):{" "}
                <code>playerId</code> con el UUID del jugador (lo ves en la URL
                al abrir su perfil, después de <code>/players/</code>) y{" "}
                <code>type</code> con el nombre del evento (
                <code>vibora</code>, <code>ace</code>, <code>bandeja</code>,{" "}
                <code>bola_fuera</code>…).
              </li>
            </ul>
            <p className="text-xs">
              Duplica el atajo para cada combinación. Si prefieres no montar
              tantos, registra los eventos desde el scorer en pantalla grande:
              la fila inferior tiene los 26 eventos ordenados por uso.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
