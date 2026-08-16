import type { CalendarEvent, CalendarEventContributor } from "@decal/shared-types";

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deliberately conservative: only title + start + end + allDay have to
 * match exactly. A shared contact's birthday synced into two people's
 * Google Calendars produces genuinely identical copies (same title, same
 * date), so this catches those. Two separately-created events that happen
 * to share a title but start a minute apart — or two people intentionally
 * scheduling the same-sounding thing at different times — never collide. */
function dedupeKey(event: CalendarEvent) {
  return `${normalizeTitle(event.title)}|${event.start}|${event.end}|${event.allDay ? 1 : 0}`;
}

/**
 * Collapses events that are the same occurrence repeated across multiple
 * family members' calendars into one entry carrying every contributing
 * member (see `CalendarEvent.contributors`) — instead of, say, a shared
 * birthday showing up once per person who has it synced.
 *
 * `preferMemberId`, when given, is used to pick which underlying copy
 * becomes the merged entry's "representative" (its id/calendarId/memberId,
 * which is what Edit and Hide act on) — preferring the viewer's own copy
 * when they're one of the contributors keeps those actions pointed at
 * something they actually own, rather than an arbitrary housemate's copy.
 */
export function dedupeCalendarEvents(
  events: CalendarEvent[],
  preferMemberId?: string | null
): CalendarEvent[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = dedupeKey(event);
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }

  const result: CalendarEvent[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Unique by memberId — someone with the exact same entry on two of
    // their OWN connected calendars collapses to one contributor, not two.
    const seenMembers = new Set<string>();
    const contributors: CalendarEventContributor[] = [];
    for (const event of group) {
      const id = event.memberId ?? event.id;
      if (seenMembers.has(id)) continue;
      seenMembers.add(id);
      contributors.push({
        memberId: event.memberId ?? "",
        memberName: event.memberName ?? null,
        color: event.color ?? "var(--color-hairline-strong)"
      });
    }

    // Every raw copy in the group turned out to belong to the same single
    // member (duplicate entries on their own account) — nothing to show as
    // "shared", so this collapses to a plain single-owner event.
    if (contributors.length <= 1) {
      result.push(group[0]);
      continue;
    }

    const representative =
      (preferMemberId ? group.find((e) => e.memberId === preferMemberId) : undefined) ?? group[0];

    result.push({ ...representative, contributors });
  }

  return result.sort((a, b) => a.start.localeCompare(b.start));
}
