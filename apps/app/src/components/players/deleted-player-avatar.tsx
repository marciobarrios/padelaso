import { UserRoundX } from "lucide-react";
import { cn } from "@/lib/utils";
import { DELETED_PLAYER_LABEL } from "@/lib/match-team";

const sizes = {
  sm: "size-8",
  md: "size-10",
} as const;

export function DeletedPlayerAvatar({ size = "sm" }: { size?: keyof typeof sizes }) {
  return (
    <span
      role="img"
      aria-label={DELETED_PLAYER_LABEL}
      title={DELETED_PLAYER_LABEL}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        sizes[size],
      )}
    >
      <UserRoundX className="size-1/2" aria-hidden="true" />
    </span>
  );
}
