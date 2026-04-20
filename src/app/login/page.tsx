"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { LoadingFallback } from "@/components/layout/loading-fallback";
import { isSafeInternalPath } from "@/lib/safe-redirect";

function LoginContent() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectToParam = searchParams.get("redirectTo");
  const redirectTo = isSafeInternalPath(redirectToParam) ? redirectToParam : "/";

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [loading, user, router, redirectTo]);

  if (loading || user) {
    return <LoadingFallback />;
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
    <Suspense fallback={<LoadingFallback />}>
      <LoginContent />
    </Suspense>
  );
}
