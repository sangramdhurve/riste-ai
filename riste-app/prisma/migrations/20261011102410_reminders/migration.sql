-- CreateEnum
CREATE TYPE "ReminderReason" AS ENUM ('EVENT_TODAY', 'EVENT_AFTER', 'EVENT_CHECKIN', 'PROMISE_DUE', 'PROMISE_OPEN', 'SNOOZE_END');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('OPEN', 'DONE', 'DRAFTED', 'SNOOZED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "snoozedUntil" TEXT;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "reminderTime" TEXT NOT NULL DEFAULT '09:30';

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "reason" "ReminderReason" NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'OPEN',
    "notifiedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_status_dueDate_idx" ON "Reminder"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_noteId_dueDate_key" ON "Reminder"("noteId", "dueDate");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
