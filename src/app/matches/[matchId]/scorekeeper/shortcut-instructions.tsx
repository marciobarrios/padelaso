"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UrlBlock({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-medium text-foreground/80">{label}</p>
      )}
      <pre className="p-2 rounded bg-muted text-xs overflow-x-auto whitespace-pre-wrap break-all">
        {url}
      </pre>
      <Button size="sm" onClick={copy} className="w-full">
        {copied ? (
          <>
            <Check className="size-3.5 mr-1.5" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-3.5 mr-1.5" /> Copiar URL
          </>
        )}
      </Button>
    </div>
  );
}

// The tap-driven Apple Watch recipe. Pure presentation given the three token
// URLs, so it can be previewed in isolation without the auth/provider stack.
export function ShortcutSetupInstructions({
  scoreUrl,
  eventsUrl,
  optionsUrl,
}: {
  scoreUrl: string;
  eventsUrl: string;
  optionsUrl: string;
}) {
  return (
    <>
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          1 · Estructura del atajo (sólo la primera vez)
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-1.5 text-muted-foreground marker:text-foreground/60">
          <li>
            iPhone → <strong>Atajos</strong> → <strong>+</strong> nuevo →
            nómbralo <em>&ldquo;Padelaso&rdquo;</em>.
          </li>
          <li>
            Añade la acción <strong>Seleccionar en el menú</strong> con tres
            opciones: <code>🔵 Punto azul</code>, <code>🔴 Punto rojo</code> y{" "}
            <code>⭐ Evento</code>.
          </li>
          <li>
            La acción crea una <strong>rama por cada opción</strong> (verás las
            etiquetas <em>Punto azul</em>, <em>Punto rojo</em>, <em>Evento</em> y{" "}
            <em>Terminar menú</em> debajo). Las acciones que pongas{" "}
            <strong>bajo cada etiqueta</strong> sólo se ejecutan si eliges esa
            opción: no hay que comprobar nada, el menú dirige el flujo solo.
            Añade las acciones de cada apartado de abajo tocando dentro de su
            etiqueta.
          </li>
        </ol>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          2 · Bajo la etiqueta 🔵 Punto azul (3 acciones)
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-2 text-muted-foreground marker:text-foreground/60">
          <li>
            <strong>Obtener contenidos de URL</strong> — pega la URL del
            marcador (abajo). Toca <strong>Mostrar más</strong>:
            <ul className="list-disc list-outside pl-5 mt-1 space-y-0.5">
              <li>
                <code>Método</code> = <code>POST</code>.
              </li>
              <li>
                <code>Cabeceras</code> → <code>Content-Type</code> ={" "}
                <code>application/json</code>.
              </li>
              <li>
                <code>Cuerpo de la solicitud</code> tipo <em>JSON</em>, con un
                campo: <code>Clave</code> = <code>team</code>;{" "}
                <code>Valor</code> = <code>1</code> (Número).
              </li>
            </ul>
          </li>
          <li>
            <strong>Obtener valor del diccionario</strong> — en{" "}
            <code>Diccionario</code> elige la variable{" "}
            <strong>Contenido de URL</strong> (salida del paso 1), y en el campo{" "}
            <code>Clave</code> escribe la palabra <code>spoken</code> (es el
            campo de la respuesta con la frase de confirmación, p.ej. el
            marcador).
          </li>
          <li>
            <strong>Mostrar notificación</strong> con la salida del paso 2 como
            texto. La confirmación aparece al instante y el atajo termina sin
            leerla en voz alta.
            <em>
              {" "}Si ya tienes el atajo creado, sustituye únicamente la acción
              Leer texto por ésta.
            </em>
          </li>
        </ol>
        <UrlBlock url={scoreUrl} label="URL del marcador (ramas azul y roja)" />
      </section>

      <section className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          3 · Bajo la etiqueta 🔴 Punto rojo
        </p>
        <p className="text-muted-foreground">
          Vuelve a añadir a mano las mismas 3 acciones de la rama azul
          (<strong>Obtener contenido de</strong> con la URL del marcador,{" "}
          <strong>Obtener valor del diccionario</strong> y{" "}
          <strong>Mostrar notificación</strong>), cambiando sólo <code>team</code>{" "}
          a <code>2</code>. En iOS mantener pulsada una acción sólo la mueve,
          así que rehacerlas suele ser más rápido que copiar y pegar.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          4 · Bajo la etiqueta ⭐ Evento (10 acciones, sin dictado)
        </p>
        <p className="text-muted-foreground">
          Registrar un evento son 3 toques: menú → evento → jugador. Las listas
          vienen del servidor con los eventos más usados primero. No hacen falta
          pasos de conversión: guarda cada <strong>Ítem seleccionado</strong> y
          envíalo directamente a la API.
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-2 text-muted-foreground marker:text-foreground/60">
          <li>
            <strong>Obtener contenidos de URL</strong> — pega la URL de opciones
            (abajo). Método <code>GET</code> (el valor por defecto), sin
            cabeceras ni cuerpo.
          </li>
          <li>
            <strong>Obtener valor del diccionario</strong> → <code>Clave</code>{" "}
            = <code>eventOptions</code>; en <code>Diccionario</code>, la variable{" "}
            <strong>Contenido de URL</strong> (paso 1).
          </li>
          <li>
            <strong>Seleccionar de la lista</strong> sobre la salida del paso 2. En
            el Watch verás sólo los eventos con su emoji, ordenados de más a
            menos usados.
          </li>
          <li>
            <strong>Definir variable</strong> <code>evento</code> con el{" "}
            <strong>Ítem seleccionado</strong> del paso 3. La API convertirá este
            nombre visible al código interno.
          </li>
          <li>
            <strong>Obtener valor del diccionario</strong> → <code>Clave</code>{" "}
            = <code>playerOptions</code>; en <code>Diccionario</code>, otra vez{" "}
            <strong>Contenido de URL</strong> del paso 1.
          </li>
          <li>
            <strong>Seleccionar de la lista</strong> sobre la salida del paso 5. En
            el Watch verás sólo el emoji y nombre de los jugadores del partido.
          </li>
          <li>
            <strong>Definir variable</strong> <code>jugador</code> con el{" "}
            <strong>Ítem seleccionado</strong> del paso 6. La API resolverá el
            identificador sin mostrarlo.
          </li>
          <li>
            <strong>Obtener contenidos de URL</strong> — pega la URL de eventos
            (abajo). <code>Método</code> = <code>POST</code>;{" "}
            <code>Content-Type</code> = <code>application/json</code>;{" "}
            <code>Cuerpo de la solicitud</code> tipo <em>JSON</em> con dos
            campos: <code>eventOption</code> = variable <code>evento</code> y{" "}
            <code>playerOption</code> = variable <code>jugador</code>. Escribe
            ambas claves respetando exactamente las mayúsculas.
          </li>
          <li>
            <strong>Obtener valor del diccionario</strong> → <code>Clave</code>{" "}
            = <code>spoken</code>; diccionario = <strong>Contenido de URL</strong>{" "}
            del paso 8.
          </li>
          <li>
            <strong>Mostrar notificación</strong> con la salida del paso 9 como
            texto. Verás la confirmación del evento sin esperar a que el Watch
            la lea en voz alta.
          </li>
        </ol>
        <UrlBlock url={optionsUrl} label="URL de opciones → paso 1" />
        <UrlBlock url={eventsUrl} label="URL de eventos → paso 8" />
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          5 · En el Apple Watch
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-1.5 text-muted-foreground marker:text-foreground/60">
          <li>
            En los ajustes del atajo (icono de la cabecera), activa{" "}
            <strong>Mostrar en Apple Watch</strong>.
          </li>
          <li>
            En el Watch: añade la complicación de <strong>Atajos</strong> a tu
            esfera y elige <em>Padelaso</em>, o lánzalo desde la app Atajos del
            reloj. Un toque abre el menú directamente.
          </li>
        </ol>
      </section>

      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        <strong>Extras opcionales</strong>: en el cuerpo JSON del marcador,{" "}
        <code>delta = -1</code> deshace un punto y <code>newSet = true</code>{" "}
        abre un set nuevo (puedes añadirlos como opciones extra del menú). La URL
        de eventos también acepta voz con un campo <code>query</code> (p.ej.{" "}
        <em>&ldquo;víbora Marcio&rdquo;</em>) si prefieres un atajo por dictado.
      </p>
    </>
  );
}
