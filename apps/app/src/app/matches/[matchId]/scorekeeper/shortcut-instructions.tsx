"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CopyValue({
  value,
  label,
  copyLabel,
}: {
  value: string;
  label: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  async function copy() {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div role="group" aria-label={label} className="space-y-2">
      <code className="block select-all break-all rounded-md bg-muted p-3 text-sm">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        onClick={copy}
        className="min-h-11 w-full touch-manipulation"
      >
        {copied ? (
          <>
            <Check aria-hidden="true" /> Copiado
          </>
        ) : (
          <>
            <Copy aria-hidden="true" /> {copyLabel}
          </>
        )}
      </Button>
      <p role="status" className="min-h-4 text-xs text-foreground/80">
        {failed
          ? "No se pudo copiar. Selecciona el texto y cópialo manualmente."
          : copied
            ? "Listo para pegar en Atajos."
            : null}
      </p>
    </div>
  );
}

function UrlBlock({ url, label }: { url: string; label: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground/80">{label}</p>
      <CopyValue key={url} value={url} label={label} copyLabel="Copiar URL" />
    </div>
  );
}

// Everyone downloads the same signed, token-free template. The personal token
// stays on this screen and is entered in Shortcuts during setup.
export function ShortcutSetupInstructions({
  token,
  scoreUrl,
  eventsUrl,
  optionsUrl,
}: {
  token: string;
  scoreUrl: string;
  eventsUrl: string;
  optionsUrl: string;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-medium">1 · Copia tu token</h3>
        <p className="text-foreground/80">
          Es tu clave personal para conectar el atajo. No la compartas.
        </p>
        <CopyValue
          key={token}
          value={token}
          label="Token de Padelaso"
          copyLabel="Copiar token"
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">2 · Añade el atajo en tu iPhone</h3>
        <a
          href="/shortcuts/Padelaso.shortcut"
          download="Padelaso.shortcut"
          className={cn(buttonVariants({ variant: "secondary" }), "min-h-11 w-full touch-manipulation")}
        >
          <Download aria-hidden="true" /> Añadir atajo
        </a>
        <p className="text-foreground/80">
          Abre el archivo descargado y pega tu token cuando Atajos lo pida.
          El menú, las URLs y los avisos de error ya están configurados.
        </p>
      </section>

      <p className="rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground/80">
        Solo tienes que configurarlo una vez. El mismo token sirve para los
        próximos partidos y el atajo está preparado para el Apple Watch.
      </p>

      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Ayuda y configuración manual
        </summary>
        <div className="space-y-5 pt-2">
          <section className="space-y-1.5">
            <h4 className="font-medium">¿Ya tienes un atajo instalado?</h4>
            <p className="text-foreground/80">
              Añade esta versión para tener los avisos de error. Tu atajo anterior
              no se actualiza solo. Puedes conservarlo hasta comprobar que el
              nuevo funciona, usando el mismo token.
            </p>
          </section>
          <section className="space-y-1.5">
            <h4 className="font-medium">En el Apple Watch</h4>
            <p className="text-foreground/80">
              Abre Atajos en el reloj y elige <em>Padelaso</em>. Si no aparece,
              revisa en el iPhone que sus ajustes tengan activado <strong>Mostrar
              en Apple Watch</strong>. También puedes añadirlo a tu esfera.
            </p>
          </section>
          <ManualShortcutInstructions
            scoreUrl={scoreUrl}
            eventsUrl={eventsUrl}
            optionsUrl={optionsUrl}
          />
        </div>
      </details>
    </div>
  );
}

function ManualShortcutInstructions({
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
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          Crear el atajo manualmente (opcional)
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-1.5 text-foreground/80 marker:text-foreground/60">
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
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          2 · Bajo la etiqueta 🔵 Punto azul
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-2 text-foreground/80 marker:text-foreground/60">
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
            <strong>Obtener valor del diccionario</strong> con clave <code>spoken</code>
            y diccionario = salida <strong>Contenido de URL</strong> de esa petición.
          </li>
          <li>
            Usa <strong>Mostrar contenido</strong> con ese valor. Contiene el
            marcador actualizado o el mensaje de error; no necesitas una condición.
          </li>
        </ol>
        <UrlBlock url={scoreUrl} label="URL del marcador (ramas azul y roja)" />
      </section>

      <section className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          3 · Bajo la etiqueta 🔴 Punto rojo
        </p>
        <p className="text-foreground/80">
          Duplica las acciones de la rama azul. Cambia sólo{" "}
          <code>team</code> a <code>2</code>.
        </p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          4 · Bajo la etiqueta ⭐ Evento (sin dictado)
        </p>
        <p className="text-foreground/80">
          Registrar un evento son 3 toques: menú → evento → jugador. Las listas
          vienen del servidor con los eventos más usados primero. No hacen falta
          pasos de conversión, pero hay que comprobar tanto la descarga de las
          opciones como el guardado final.
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-2 text-foreground/80 marker:text-foreground/60">
          <li>
            <strong>Obtener contenidos de URL</strong> — pega la URL de opciones
            (abajo). Método <code>GET</code> (el valor por defecto), sin
            cabeceras ni cuerpo.
          </li>
          <li>
            Guarda la salida como variable <code>respuestaOpciones</code>, obtén
            su clave <code>error</code> y añade <strong>Si no tiene ningún valor</strong>. Pon
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
            <code>error</code> y añade <strong>Si tiene algún valor</strong>. Dentro, obtén
            <code>spoken</code> de <code>respuestaEvento</code> y usa
            <strong> Mostrar alerta</strong>. Si no hay error, no hace falta
            añadir ninguna acción: el éxito queda silencioso.
          </li>
        </ol>
        <UrlBlock url={optionsUrl} label="URL de opciones → paso 1" />
        <UrlBlock url={eventsUrl} label="URL de eventos → petición final" />
      </section>

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground/80">
          5 · En el Apple Watch
        </p>
        <ol className="list-decimal list-outside pl-5 space-y-1.5 text-foreground/80 marker:text-foreground/60">
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

      <p className="text-xs text-foreground/80 border-t border-border pt-3">
        <strong>Extras opcionales</strong>: en el cuerpo JSON del marcador,{" "}
        <code>delta = -1</code> deshace un punto y <code>newSet = true</code>{" "}
        abre un set nuevo (puedes añadirlos como opciones extra del menú). La URL
        de eventos también acepta voz con un campo <code>query</code> (p.ej.{" "}
        <em>&ldquo;víbora Marcio&rdquo;</em>) si prefieres un atajo por dictado.
      </p>
    </>
  );
}
