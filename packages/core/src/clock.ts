export class WorldClock {
  private currentTime: Date;

  constructor(startTime: Date = new Date(1999, 4, 14, 18, 0)) {
    this.currentTime = startTime;
  }

  advance(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60_000);
  }

  get(): Date {
    return this.currentTime;
  }

  static fromISOString(iso: string): WorldClock {
    return new WorldClock(new Date(iso));
  }
}

/**
 * Naturalizes a standard datetime format into a psychologically realistic subjective duration.
 * Resolves quantized time formats into natural language phrases based on the relationship
 * between a reference/current time and a past event time.
 */
export function naturalizeTime(now: Date, past: Date): string {
  const deltaMs = now.getTime() - past.getTime();

  // Guard against future dates
  if (deltaMs <= 0) {
    return "just now";
  }

  const deltaSeconds = Math.floor(deltaMs / 1000);
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  const deltaHours = Math.floor(deltaMinutes / 60);
  const deltaDays = Math.floor(deltaHours / 24);

  // --- Tier 1: Pure Relative (delta < 6 hours) ---
  if (deltaHours < 6) {
    if (deltaMinutes < 1) return "just now";
    if (deltaMinutes < 3) return "moments ago";
    if (deltaMinutes < 10) return "a few minutes ago";
    if (deltaMinutes < 30) return "several minutes ago";
    if (deltaMinutes < 45) return "about half an hour ago";
    if (deltaHours < 1.5) return "about an hour ago";
    if (deltaHours < 3) return "a couple hours ago";
    return "a few hours ago";
  }

  // --- Tier 3: Coarse (delta >= 48 hours / 2 days) ---
  if (deltaDays >= 2) {
    if (deltaDays < 3) return "a couple days ago";
    if (deltaDays < 7) return "a few days ago";
    if (deltaDays < 14) return "about a week ago";
    if (deltaDays < 21) return "a couple weeks ago";
    if (deltaDays < 30) return "a few weeks ago";
    if (deltaDays < 60) return "about a month ago";
    if (deltaDays < 90) return "a couple months ago";
    if (deltaDays < 180) return "a few months ago";
    if (deltaDays < 365) return "many months ago";
    if (deltaDays < 730) return "about a year ago";
    return "years ago";
  }

  // --- Tier 2: Period-Anchored (6 hours <= delta < 48 hours) ---
  const pastHour = past.getHours();

  let period: string;
  if (pastHour >= 5 && pastHour < 12) {
    period = "morning";
  } else if (pastHour >= 12 && pastHour < 17) {
    period = "afternoon";
  } else if (pastHour >= 17 && pastHour < 21) {
    period = "evening";
  } else if (pastHour >= 21 && pastHour < 24) {
    period = "night";
  } else if (pastHour >= 0 && pastHour < 3) {
    period = "midnight";
  } else {
    period = "late night";
  }

  // Subjective day test: waking hours (05:00 - 20:59)
  const nowHour = now.getHours();
  const pastIsWaking = pastHour >= 5 && pastHour < 22;
  const nowIsWaking = nowHour >= 5 && nowHour < 22;

  const isSameSubjectiveDay = pastIsWaking && nowIsWaking && deltaHours < 18;

  if (isSameSubjectiveDay) {
    return `earlier today, in the ${period}`;
  }

  if (period === "night") {
    return "last night";
  }
  if (period === "midnight") {
    return "around midnight";
  }
  if (period === "late night") {
    return "late last night";
  }

  return `yesterday ${period}`;
}
