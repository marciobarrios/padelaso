"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useGroup } from "@/components/group/group-provider";
import { useDataRefresh } from "@/lib/supabase-hooks";
import { createGroup, joinGroupByCode } from "@/lib/supabase-mutations";
import { cn } from "@/lib/utils";

const GROUP_EMOJIS = [
  "🏸", "🎾", "🏓", "⚽", "🏀", "🎯", "🔥", "⭐",
  "🦁", "🐯", "🦊", "🐻", "🦄", "🎸", "💎", "🏆",
];

export default function GroupOnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { setActiveGroupId } = useGroup();
  const { refresh } = useDataRefresh();
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏸");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !user) return;
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup(name.trim(), emoji, user.id);
      refresh();
      setActiveGroupId(group.id);
      router.replace("/");
    } catch {
      setError("No se pudo crear el grupo");
      setSaving(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const group = await joinGroupByCode(joinCode);
      refresh();
      setActiveGroupId(group.id);
      router.replace("/");
    } catch {
      setError("Código no válido o grupo no encontrado");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <p className="text-5xl">🏸</p>
          <h1 className="text-2xl font-bold font-heading">Bienvenido a Padelaso</h1>
          <p className="text-sm text-muted-foreground">
            Crea un grupo para jugar con tus amigos o únete a uno existente
          </p>
        </div>

        {mode === "choice" && (
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full h-14 text-lg"
              onClick={() => setMode("create")}
            >
              <Plus className="size-5 mr-2" />
              Crear grupo
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full h-14 text-lg"
              onClick={() => setMode("join")}
            >
              <UserPlus className="size-5 mr-2" />
              Unirse con código
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-4">
            <Input
              placeholder="Nombre del grupo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Icono</p>
              <div className="grid grid-cols-8 gap-1">
                {GROUP_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={cn(
                      "size-10 text-xl rounded-lg flex items-center justify-center transition-colors",
                      emoji === e
                        ? "bg-primary/20 ring-2 ring-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMode("choice"); setError(null); }} className="flex-1">
                Atrás
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || saving} className="flex-1">
                {saving ? "Creando..." : "Crear grupo"}
              </Button>
            </div>
          </div>
        )}

        {mode === "join" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Introduce el código de invitación
              </p>
              <Input
                placeholder="Ej: ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="text-center text-lg tracking-widest font-mono"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setMode("choice"); setError(null); }} className="flex-1">
                Atrás
              </Button>
              <Button onClick={handleJoin} disabled={joinCode.length < 6 || saving} className="flex-1">
                {saving ? "Uniendo..." : "Unirse"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
