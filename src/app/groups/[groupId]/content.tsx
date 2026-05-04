"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, RefreshCw, LogOut, Pencil, Crown, Trash2 } from "lucide-react";
import { useGroup } from "@/components/group/group-provider";
import { useGroupMembers, usePlayers, invalidate, keys } from "@/lib/db-hooks";
import { useAuth } from "@/components/auth/auth-provider";
import {
  updateGroup,
  regenerateInviteCode,
  leaveGroup,
  deleteGroup,
} from "@/lib/supabase-mutations";
import { cn } from "@/lib/utils";

const ConfirmDialog = dynamic(() =>
  import("@/components/confirm-dialog").then((m) => ({ default: m.ConfirmDialog }))
);

const GROUP_EMOJIS = [
  "🏸", "🎾", "🏓", "⚽", "🏀", "🎯", "🔥", "⭐",
  "🦁", "🐯", "🦊", "🐻", "🦄", "🎸", "💎", "🏆",
];

export function GroupSettingsContent({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { groups, setActiveGroupId } = useGroup();

  const members = useGroupMembers(groupId);
  const { players } = usePlayers(groupId);

  const group = groups.find((g) => g.id === groupId);
  const myMembership = members.find((m) => m.userId === user?.id);
  const isAdmin = myMembership?.role === "admin";

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveMounted, setLeaveMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMounted, setDeleteMounted] = useState(false);

  function startEdit() {
    if (!group) return;
    setEditName(group.name);
    setEditEmoji(group.emoji);
    setEditing(true);
  }

  async function saveEdit() {
    if (!editName.trim()) return;
    await updateGroup(groupId, { name: editName.trim(), emoji: editEmoji });
    invalidate(keys.groups());
    setEditing(false);
  }

  async function handleRegenerateCode() {
    await regenerateInviteCode(groupId);
    invalidate(keys.groups());
  }

  async function copyCode() {
    if (!group) return;
    await navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareCode() {
    if (!group) return;
    const url = `${window.location.origin}/groups/onboarding?code=${group.inviteCode}`;
    if (navigator.share) {
      await navigator.share({
        title: `Únete a ${group.name} en Padelaso`,
        text: `Usa el código ${group.inviteCode} para unirte a mi grupo en Padelaso`,
        url,
      });
    } else {
      copyCode();
    }
  }

  async function handleLeave() {
    if (!user) return;
    await leaveGroup(groupId, user.id);
    invalidate(keys.groups(), keys.players(groupId));
    const remaining = groups.filter((g) => g.id !== groupId);
    if (remaining.length > 0) {
      setActiveGroupId(remaining[0].id);
      router.replace("/");
    } else {
      router.replace("/groups/onboarding");
    }
  }

  async function handleDelete() {
    await deleteGroup(groupId);
    invalidate(keys.groups());
    const remaining = groups.filter((g) => g.id !== groupId);
    if (remaining.length > 0) {
      setActiveGroupId(remaining[0].id);
      router.replace("/");
    } else {
      router.replace("/groups/onboarding");
    }
  }

  if (!group) {
    return (
      <MobileShell>
        <PageHeader title="Grupo" back />
        <p className="text-center py-12 text-muted-foreground">
          Grupo no encontrado
        </p>
      </MobileShell>
    );
  }

  // Find player names for members (match via players with user_id)
  function getMemberDisplayName(userId: string): string {
    const player = players.find((p) => p.userId === userId);
    return player?.name ?? "Usuario";
  }

  function getMemberEmoji(userId: string): string {
    const player = players.find((p) => p.userId === userId);
    return player?.emoji ?? "👤";
  }

  return (
    <MobileShell>
      <PageHeader
        title="Ajustes del grupo"
        back
        action={
          isAdmin && !editing ? (
            <Button variant="ghost" size="icon" onClick={startEdit}>
              <Pencil className="size-4" />
            </Button>
          ) : undefined
        }
      />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Group info */}
        {editing ? (
          <Card>
            <CardContent className="p-4 space-y-4">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                autoFocus
              />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Icono</p>
                <div className="grid grid-cols-8 gap-1">
                  {GROUP_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEditEmoji(e)}
                      className={cn(
                        "size-10 text-xl rounded-lg flex items-center justify-center transition-colors",
                        editEmoji === e
                          ? "bg-primary/20 ring-2 ring-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={saveEdit} disabled={!editName.trim()} className="flex-1">
                  Guardar
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="text-5xl">{group.emoji}</span>
            <h2 className="text-xl font-bold">{group.name}</h2>
            <p className="text-sm text-muted-foreground">
              {members.length} miembro{members.length !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Invite code */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Código de invitación</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl font-heading font-bold tracking-[0.3em] font-mono">
                {group.inviteCode}
              </span>
              <Button variant="ghost" size="icon" onClick={copyCode}>
                {copied ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={shareCode} className="flex-1">
                Compartir
              </Button>
              {isAdmin && (
                <Button variant="outline" size="icon" onClick={handleRegenerateCode} title="Regenerar código">
                  <RefreshCw className="size-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Miembros
          </h3>
          <div className="space-y-2">
            {members.map((member) => (
              <Card key={member.userId}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-xl">{getMemberEmoji(member.userId)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {getMemberDisplayName(member.userId)}
                      {member.userId === user?.id && (
                        <span className="text-muted-foreground"> (tú)</span>
                      )}
                    </p>
                  </div>
                  {member.role === "admin" && (
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="size-3" />
                      Admin
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Leave / Delete group */}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => { setLeaveMounted(true); setLeaveOpen(true); }}
          >
            <LogOut className="size-4 mr-2" />
            Salir del grupo
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => { setDeleteMounted(true); setDeleteOpen(true); }}
            >
              <Trash2 className="size-4 mr-2" />
              Eliminar grupo
            </Button>
          )}
        </div>
      </div>

      {leaveMounted && (
        <ConfirmDialog
          open={leaveOpen}
          onOpenChange={setLeaveOpen}
          title="Salir del grupo"
          description={`¿Seguro que quieres salir de "${group.name}"? Podrás volver a unirte con el código de invitación.`}
          confirmLabel="Salir"
          onConfirm={handleLeave}
        />
      )}
      {deleteMounted && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Eliminar grupo"
          description={`¿Seguro que quieres eliminar "${group.name}"? Se borrarán todos los jugadores, partidos y eventos del grupo. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
        />
      )}
    </MobileShell>
  );
}
