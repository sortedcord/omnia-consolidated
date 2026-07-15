import { describe, test, expect } from "vitest";
import { naturalizeTime } from "../src/clock.js";

describe("TimeNaturalization Unit Tests (Tier 1)", () => {
  test("future or current times return just now", () => {
    const now = new Date(2026, 6, 8, 12, 0, 0);
    const pastFuture = new Date(2026, 6, 8, 12, 0, 5);
    expect(naturalizeTime(now, pastFuture)).toBe("just now");
    expect(naturalizeTime(now, now)).toBe("just now");
  });

  test("Tier 1: relative time ranges (< 6 hours)", () => {
    const now = new Date(2026, 6, 8, 12, 0, 0);

    // < 1 minute
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 59, 30))).toBe(
      "just now",
    );
    // < 3 minutes
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 58, 0))).toBe(
      "moments ago",
    );
    // < 10 minutes
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 52, 0))).toBe(
      "a few minutes ago",
    );
    // < 30 minutes
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 40, 0))).toBe(
      "several minutes ago",
    );
    // < 45 minutes
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 20, 0))).toBe(
      "about half an hour ago",
    );
    // < 1.5 hours (90 minutes)
    expect(naturalizeTime(now, new Date(2026, 6, 8, 10, 50, 0))).toBe(
      "about an hour ago",
    );
    // < 3 hours
    expect(naturalizeTime(now, new Date(2026, 6, 8, 9, 30, 0))).toBe(
      "a couple hours ago",
    );
    // < 6 hours
    expect(naturalizeTime(now, new Date(2026, 6, 8, 7, 0, 0))).toBe(
      "a few hours ago",
    );
  });

  test("Tier 2: Same subjective day vs yesterday periods (6h <= delta < 48h)", () => {
    // 1. Same subjective day (both waking hours, delta < 18h)
    // 9am to 3pm (delta 6h) -> morning
    const nowWaking = new Date(2026, 6, 8, 15, 0, 0);
    const pastMorning = new Date(2026, 6, 8, 9, 0, 0);
    expect(naturalizeTime(nowWaking, pastMorning)).toBe(
      "earlier today, in the morning",
    );

    // 2pm to 9pm (delta 7h) -> afternoon
    const nowEvening = new Date(2026, 6, 8, 21, 0, 0);
    const pastAfternoon = new Date(2026, 6, 8, 14, 0, 0);
    expect(naturalizeTime(nowEvening, pastAfternoon)).toBe(
      "earlier today, in the afternoon",
    );

    // 2. Previous night (past period: night (21-23))
    // 11pm to 5am (delta 6h) -> last night
    const nowNightRun = new Date(2026, 6, 8, 5, 0, 0);
    const pastNight = new Date(2026, 6, 7, 23, 0, 0);
    expect(naturalizeTime(nowNightRun, pastNight)).toBe("last night");

    // 3. Around midnight (past period: midnight (0-2))
    // 1am to 7am (delta 6h) -> around midnight
    const nowMidnightRun = new Date(2026, 6, 8, 7, 0, 0);
    const pastMidnight = new Date(2026, 6, 8, 1, 0, 0);
    expect(naturalizeTime(nowMidnightRun, pastMidnight)).toBe(
      "around midnight",
    );

    // 4. Late night (past period: late night (3-4))
    // 3am to 9am (delta 6h) -> late last night
    const nowLateNightRun = new Date(2026, 6, 8, 9, 0, 0);
    const pastLateNight = new Date(2026, 6, 8, 3, 0, 0);
    expect(naturalizeTime(nowLateNightRun, pastLateNight)).toBe(
      "late last night",
    );

    // 5. Yesterday waking hours (delta >= 6h, diff day / waking check fails)
    // 3pm to 9am next day (delta 18h) -> yesterday afternoon
    const nowNextDay = new Date(2026, 6, 9, 9, 0, 0);
    const pastYesterdayAfternoon = new Date(2026, 6, 8, 15, 0, 0);
    expect(naturalizeTime(nowNextDay, pastYesterdayAfternoon)).toBe(
      "yesterday afternoon",
    );
  });

  test("Tier 3: Coarse relative time ranges (delta >= 48 hours)", () => {
    const now = new Date(2026, 6, 10, 12, 0, 0);

    // 2 days
    expect(naturalizeTime(now, new Date(2026, 6, 8, 11, 0, 0))).toBe(
      "a couple days ago",
    );
    // 3-6 days
    expect(naturalizeTime(now, new Date(2026, 6, 6, 12, 0, 0))).toBe(
      "a few days ago",
    );
    // 7-13 days
    expect(naturalizeTime(now, new Date(2026, 6, 1, 12, 0, 0))).toBe(
      "about a week ago",
    );
    // 14-20 days
    expect(naturalizeTime(now, new Date(2026, 5, 25, 12, 0, 0))).toBe(
      "a couple weeks ago",
    );
    // 21-29 days
    expect(naturalizeTime(now, new Date(2026, 5, 15, 12, 0, 0))).toBe(
      "a few weeks ago",
    );
    // 30-59 days
    expect(naturalizeTime(now, new Date(2026, 5, 1, 12, 0, 0))).toBe(
      "about a month ago",
    );
    // 60-89 days
    expect(naturalizeTime(now, new Date(2026, 4, 1, 12, 0, 0))).toBe(
      "a couple months ago",
    );
    // 90-179 days
    expect(naturalizeTime(now, new Date(2026, 3, 1, 12, 0, 0))).toBe(
      "a few months ago",
    );
    // 180-364 days
    expect(naturalizeTime(now, new Date(2026, 0, 1, 12, 0, 0))).toBe(
      "many months ago",
    );
    // 365-729 days
    expect(naturalizeTime(now, new Date(2025, 6, 1, 12, 0, 0))).toBe(
      "about a year ago",
    );
    // >= 730 days
    expect(naturalizeTime(now, new Date(2023, 6, 1, 12, 0, 0))).toBe(
      "years ago",
    );
  });
});
