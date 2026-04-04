"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

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
      <Button onClick={signInWithGoogle} size="lg" className="w-full max-w-xs">
        Iniciar sesión con Google
      </Button>
    </div>
  );
}
