"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectToParam = searchParams.get("redirectTo");
  const redirectTo =
    redirectToParam && redirectToParam.startsWith("/") && !redirectToParam.startsWith("//")
      ? redirectToParam
      : "/";

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [loading, user, router, redirectTo]);

  if (loading || user) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-dvh px-6 gap-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-heading font-bold">Padelaso</h1>
        <p className="text-muted-foreground">
          Gamifica tus partidos de pádel con amigos
        </p>
      </div>
      <Button
        onClick={() => signInWithGoogle(redirectTo)}
        size="lg"
        className="w-full max-w-xs"
      >
        Iniciar sesión con Google
      </Button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-dvh">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
