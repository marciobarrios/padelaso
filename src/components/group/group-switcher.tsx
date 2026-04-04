"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, UserPlus } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGroup } from "./group-provider";
import { useAuth } from "@/components/auth/auth-provider";
import { useDataRefresh } from "@/lib/supabase-hooks";
import { createGroup, joinGroupByCode } from "@/lib/supabase-mutations";
import { cn } from "@/lib/utils";

const GROUP_EMOJIS = [
  "🏸", "🎾", "🏓", "⚽", "🏀", "🎯", "🔥", "⭐",
  "🦁", "🐯", "🦊", "🐻", "🦄", "🎸", "💎", "🏆",
];

export function GroupSwitcher() {
  const { groups, activeGroup, setActiveGroup, setActiveGroupId } = useGroup();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create" | "join">("list");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏸");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const { refresh } = useDataRefresh();
  const router = useRouter();

  function resetAndClose() {
    setMode("list");
    setName("");
    setEmoji("🏸");
    setJoinCode("");
    setError(null);
    setOpen(false);
  }

  async function handleCreate() {
    if (!name.trim() || !user) return;
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup(name.trim(), emoji, user.id);
      refresh();
      setActiveGroup(group);
      resetAndClose();
    } catch {
      setError("No se pudo crear el grupo");
    } finally {
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
      setActiveGroup(group);
      resetAndClose();
    } catch {
      setError("Código no válido o grupo no encontrado");
    } finally {
      setSaving(false);
    }
  }

  if (!activeGroup) return null;

  return (
    <Drawer open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMode("list"); }}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors text-sm font-medium">
          <span>{activeGroup.emoji}</span>
          <span className="max-w-[120px] truncate">{activeGroup.name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {mode === "list" && "Tus grupos"}
            {mode === "create" && "Crear grupo"}
            {mode === "join" && "Unirse a grupo"}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-3">
          {mode === "list" && (
            <>
              {groups.map((group) => (
                <DrawerClose key={group.id} asChild>
                  <button
                    onClick={() => setActiveGroupId(group.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                      group.id === activeGroup.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="text-2xl">{group.emoji}</span>
                    <span className="flex-1 text-left font-medium truncate">
                      {group.name}
                    </span>
                    {group.id === activeGroup.id && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                </DrawerClose>
              ))}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setMode("create")}
                >
                  <Plus className="size-4 mr-1" />
                  Crear grupo
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setMode("join")}
                >
                  <UserPlus className="size-4 mr-1" />
                  Unirse
                </Button>
              </div>

              {/* Settings link for active group */}
              <button
                onClick={() => {
                  resetAndClose();
                  router.push(`/groups/${activeGroup.id}`);
                }}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                Ajustes del grupo
              </button>
            </>
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
                <Button variant="outline" onClick={() => { setMode("list"); setError(null); }} className="flex-1">
                  Atrás
                </Button>
                <Button onClick={handleCreate} disabled={!name.trim() || saving} className="flex-1">
                  {saving ? "Creando..." : "Crear"}
                </Button>
              </div>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Introduce el código de invitación de 6 caracteres
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
                <Button variant="outline" onClick={() => { setMode("list"); setError(null); }} className="flex-1">
                  Atrás
                </Button>
                <Button onClick={handleJoin} disabled={joinCode.length < 6 || saving} className="flex-1">
                  {saving ? "Uniendo..." : "Unirse"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
