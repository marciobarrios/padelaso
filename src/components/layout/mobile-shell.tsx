"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Home, Users, BarChart3, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { useGroup } from "@/components/group/group-provider";
import { GroupSwitcher } from "@/components/group/group-switcher";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/players", label: "Jugadores", icon: Users },
  { href: "/stats", label: "Stats", icon: BarChart3 },
] as const;

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { groups, activeGroup, loading: groupLoading } = useGroup();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // Redirect to onboarding if user has no groups
  useEffect(() => {
    if (!loading && !groupLoading && user && groups.length === 0) {
      router.replace("/groups/onboarding");
    }
  }, [loading, groupLoading, user, groups, router]);

  if (loading || !user || groupLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-dvh">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return null; // Will redirect to onboarding
  }

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Group switcher bar */}
      <div className="flex items-center justify-center py-2 px-4">
        <GroupSwitcher />
      </div>
      <main className="flex-1 overflow-y-auto pb-20">{children}</main>
      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </Link>
            );
          })}
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {user.user_metadata?.avatar_url ? (
              <Image
                src={user.user_metadata.avatar_url}
                alt=""
                width={20}
                height={20}
                className="size-5 rounded-full"
              />
            ) : (
              <LogOut className="size-5" />
            )}
            <span>Salir</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
