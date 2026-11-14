"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { decideAuthorization } from "./actions";

function DecisionButtons({ canApprove }: { canApprove: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="submit" name="decision" value="deny" variant="outline" size="lg" disabled={pending}>
        {canApprove ? "Cancelar" : "Volver"}
      </Button>
      {canApprove && (
        <Button type="submit" name="decision" value="approve" size="lg" disabled={pending}>
          {pending ? "Conectando…" : "Permitir acceso"}
        </Button>
      )}
    </div>
  );
}

/** Deny is always offered so the client learns the outcome instead of waiting. */
export function ConsentForm({ authorizationId, canApprove }: { authorizationId: string; canApprove: boolean }) {
  return (
    <form action={decideAuthorization}>
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <DecisionButtons canApprove={canApprove} />
    </form>
  );
}
