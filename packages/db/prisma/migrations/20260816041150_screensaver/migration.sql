-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" DATETIME,
    CONSTRAINT "GroceryItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroceryItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Chore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "recurrence" TEXT,
    "dueDate" DATETIME,
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "Chore_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chore" ("archivedAt", "createdAt", "description", "dueDate", "familyId", "id", "points", "recurrence", "title") SELECT "archivedAt", "createdAt", "description", "dueDate", "familyId", "id", "points", "recurrence", "title" FROM "Chore";
DROP TABLE "Chore";
ALTER TABLE "new_Chore" RENAME TO "Chore";
CREATE TABLE "new_ChoreAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "choreId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChoreAssignment_choreId_fkey" FOREIGN KEY ("choreId") REFERENCES "Chore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChoreAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChoreAssignment" ("choreId", "id", "userId") SELECT "choreId", "id", "userId" FROM "ChoreAssignment";
DROP TABLE "ChoreAssignment";
ALTER TABLE "new_ChoreAssignment" RENAME TO "ChoreAssignment";
CREATE UNIQUE INDEX "ChoreAssignment_choreId_userId_key" ON "ChoreAssignment"("choreId", "userId");
CREATE TABLE "new_Family" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "mealPrepTypes" TEXT NOT NULL DEFAULT 'BREAKFAST,LUNCH,DINNER,SNACK',
    "choresScoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "screensaverEnabled" BOOLEAN NOT NULL DEFAULT true,
    "screensaverIdleMinutes" INTEGER NOT NULL DEFAULT 5,
    "weatherLat" REAL,
    "weatherLon" REAL,
    "weatherLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Family" ("choresScoringEnabled", "createdAt", "id", "inviteCode", "mealPrepTypes", "name") SELECT "choresScoringEnabled", "createdAt", "id", "inviteCode", "mealPrepTypes", "name" FROM "Family";
DROP TABLE "Family";
ALTER TABLE "new_Family" RENAME TO "Family";
CREATE UNIQUE INDEX "Family_inviteCode_key" ON "Family"("inviteCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GroceryItem_familyId_idx" ON "GroceryItem"("familyId");
