import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSimDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return isoString;
  }
}

export function formatSimTimeHM(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const hh = String(d.getUTCHours());
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return isoString;
  }
}

export function getClockIcon(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "/clock_day_icon.png";
    const hour = d.getUTCHours();
    return hour >= 6 && hour < 18
      ? "/clock_day_icon.png"
      : "/clock_night_icon.png";
  } catch {
    return "/clock_day_icon.png";
  }
}
