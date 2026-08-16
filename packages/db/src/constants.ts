// SQLite (our local/dev database provider) doesn't support native enums, so
// `FamilyMembership.role` and `MealPlanEntry.mealType` are plain Prisma
// `String` fields. These constants are the source of truth for what values
// are actually valid — enforce them here rather than trusting whatever a
// caller sends.
//
// If you switch `packages/db/prisma/schema.prisma` to `provider = "postgresql"`,
// you can convert these back to real Prisma `enum`s and delete this file —
// Postgres supports them natively.

export const FAMILY_ROLES = ["OWNER", "MEMBER"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/**
 * Palette for telling family members apart at a glance — calendar events,
 * chore tags, the member filter row. The first 5 mirror --accent-1..5 in
 * apps/web/app/globals.css (those five are also fixed UI roles — chores
 * tab, meals tab, etc. — so they stay put); the rest exist only to give
 * larger families more distinct member colors and aren't tied to any UI
 * role. Duplicated (rather than imported from @decal/shared-types) so this
 * package doesn't pick up a dependency on the UI-facing types package —
 * keep the two in sync by hand if you ever change this list.
 */
export const MEMBER_COLOR_PALETTE = [
  "#F0633D", // coral
  "#34A896", // teal
  "#E7A93B", // gold
  "#6E7BF2", // periwinkle
  "#D46FB0", // orchid
  "#7FB069", // sage
  "#4A9CC7", // steel blue
  "#9B6FD9", // violet
  "#D9587A" // rose
] as const;
