-- CreateTable
CREATE TABLE "HiddenEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiddenEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HiddenEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HiddenEvent_familyId_idx" ON "HiddenEvent"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenEvent_ownerId_calendarId_eventId_key" ON "HiddenEvent"("ownerId", "calendarId", "eventId");
