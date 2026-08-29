import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export {
  applyScoreDelta,
  buildPlayerMap,
  getSetWins,
} from "@padelaso/domain/matches";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
