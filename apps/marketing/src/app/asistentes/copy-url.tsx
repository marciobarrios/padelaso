"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyUrl({ url }: { url: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-sm sm:flex-row sm:items-stretch border-2 border-button-border bg-card p-2">
        <code className="min-w-0 flex-1 px-2 sm:self-center py-1 font-mono text-[15px] break-all select-all">{url}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-button px-4 font-[750] text-button-ink focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          {status === "copied" ? <Check aria-hidden="true" size={18} /> : <Copy aria-hidden="true" size={18} />}
          {status === "copied" ? "Copiada" : "Copiar URL"}
        </button>
      </div>
      <p role="status" className="text-sm text-ink-soft">
        {status === "copied" && "URL copiada en el portapapeles."}
        {status === "failed" && "No se pudo copiar. Selecciona la URL y cópiala a mano."}
      </p>
    </div>
  );
}
