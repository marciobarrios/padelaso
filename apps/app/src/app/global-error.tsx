"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <title>Error | Padelaso</title>
        <h1>Algo ha salido mal</h1>
        <p>Inténtalo de nuevo en unos instantes.</p>
        <button onClick={() => retry()}>Reintentar</button>
      </body>
    </html>
  );
}
