import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  emoji: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-8 text-base",
  md: "size-10 text-xl",
  lg: "size-14 text-3xl",
};

export function PlayerAvatar({
  emoji,
  name,
  size = "md",
  className,
}: PlayerAvatarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-muted shrink-0",
        sizeClasses[size],
        className
      )}
      title={name}
    >
      {emoji}
    </div>
  );
}
