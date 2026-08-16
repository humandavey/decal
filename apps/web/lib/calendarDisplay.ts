import type { CalendarEvent } from "@decal/shared-types";

/** "Alice", "Alice & Bob", "Alice, Bob & Sam" — reads from the merged
 * `contributors` list when present (see lib/eventDedupe.ts), otherwise
 * falls back to the plain single-owner `memberName` field so ordinary,
 * non-merged events render exactly as they did before this existed. */
export function contributorNames(event: CalendarEvent): string | null {
  const names = (event.contributors ?? [])
    .map((c) => c.memberName)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return event.memberName ?? null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** Colors for every contributor, for a stacked-dot indicator — falls back
 * to the single `color` field (as a one-item list) for a non-merged event. */
export function contributorColors(event: CalendarEvent): string[] {
  const colors = (event.contributors ?? []).map((c) => c.color).filter(Boolean);
  if (colors.length > 0) return colors;
  return event.color ? [event.color] : [];
}

export function isMergedEvent(event: CalendarEvent): boolean {
  return Boolean(event.contributors && event.contributors.length > 1);
}
