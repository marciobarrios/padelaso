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

      <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="font-medium text-foreground">
          Importante si ya tienes el atajo instalado
        </p>
        <p className="text-muted-foreground">
          La web no puede modificar automáticamente un atajo que ya está en tu
          iPhone o Apple Watch. Añade la comprobación <code>ok</code> y la acción
          <strong> Mostrar alerta</strong> descritas abajo en cada petición. Así
          verás el mensaje devuelto por Padelaso cuando no se guarde un punto o
          un evento.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          2 · Bajo la etiqueta 🔵 Punto azul
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
            <strong>Definir variable</strong> <code>respuesta</code> con la salida
            <strong> Contenido de URL</strong> del paso anterior.
          </li>
          <li>
            <strong>Obtener valor del diccionario</strong> con clave <code>ok</code>
            y diccionario <code>respuesta</code>.
          </li>
          <li>
            Añade <strong>Si</strong> y comprueba que <code>ok</code> sea
            verdadero. Dentro de esa rama, obtén la clave <code>score</code> de
            <code>respuesta</code> y usa <strong>Mostrar contenido</strong> con el
            resultado. El marcador actualizado aparecerá en el Watch.
          </li>
          <li>
            Dentro de <strong>Si no</strong>, obtén la clave <code>spoken</code>
            de <code>respuesta</code> y pásala a <strong>Mostrar alerta</strong>.
            Puedes usar <em>Padelaso</em> como título.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Es importante elegir <code>respuesta</code> como diccionario en ambos
          casos. Si dejas la variable automática del paso inmediatamente
          anterior, Atajos intentará leer <code>score</code> o <code>spoken</code>
          desde el booleano <code>ok</code>.
        </p>
        <UrlBlock url={scoreUrl} label="URL del marcador (ramas azul y roja)" />
      </section>

      <section className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          3 · Bajo la etiqueta 🔴 Punto rojo
        </p>
        <p className="text-muted-foreground">
          Duplica todas las acciones de la rama azul, incluida la comprobación
          de <code>ok</code> y la alerta de <code>spoken</code>. Cambia sólo{" "}
          <code>team</code> a <code>2</code>.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          4 · Bajo la etiqueta ⭐ Evento (sin dictado)
        </p>
        <p className="text-muted-foreground">
          Registrar un evento son 3 toques: menú → evento → jugador. Las listas
          vienen del servidor con los eventos más usados primero. No hacen falta
          pasos de conversión, pero hay que comprobar tanto la descarga de las
          opciones como el guardado final.
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-2 text-muted-foreground marker:text-foreground/60">
          <li>
            <strong>Obtener contenidos de URL</strong> — pega la URL de opciones
            (abajo). Método <code>GET</code> (el valor por defecto), sin
            cabeceras ni cuerpo.
          </li>
          <li>
            Guarda la salida como variable <code>respuestaOpciones</code>, obtén
            su clave <code>ok</code> y añade <strong>Si</strong> es verdadero. Pon
            los pasos 3 a 8 dentro de esa rama. En <strong>Si no</strong>, obtén
            <code>spoken</code> de <code>respuestaOpciones</code> y usa
            <strong> Mostrar alerta</strong>.
          </li>
          <li>
            Dentro de <strong>Si</strong>, obtén <code>eventOptions</code> de
            <code>respuestaOpciones</code> y usa <strong>Seleccionar de la
            lista</strong>. En el Watch verás los eventos con su emoji.
          </li>
          <li>
            <strong>Definir variable</strong> <code>evento</code> con el
            <strong> Ítem seleccionado</strong>. La API convertirá este
            nombre visible al código interno.
          </li>
          <li>
            Obtén <code>playerOptions</code> de <code>respuestaOpciones</code> y
            usa <strong>Seleccionar de la lista</strong>.
          </li>
          <li>
            <strong>Definir variable</strong> <code>jugador</code> con el
            <strong> Ítem seleccionado</strong>. La API resolverá el
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
            Guarda esa salida como <code>respuestaEvento</code>, obtén su clave
            <code>ok</code> y añade <strong>Si</strong>. Si es falso, obtén
            <code>spoken</code> de <code>respuestaEvento</code> y usa
            <strong> Mostrar alerta</strong>. Si es verdadero, no hace falta
            añadir ninguna acción: el éxito queda silencioso.
          </li>
        </ol>
        <UrlBlock url={optionsUrl} label="URL de opciones → paso 1" />
        <UrlBlock url={eventsUrl} label="URL de eventos → petición final" />
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
          <li>
            Cuando termine el partido, vuelve al scorekeeper y pulsa{" "}
            <strong>Finalizar partido en directo</strong>. El token permanente se
            conserva, pero queda inactivo hasta que empieces otro partido.
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
