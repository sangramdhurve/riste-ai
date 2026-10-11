-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('FACT', 'EVENT', 'PROMISE');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('ACTIVE', 'DONE');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" "NoteKind" NOT NULL DEFAULT 'FACT',
    "text" TEXT NOT NULL,
    "eventDate" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "status" "NoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_contactId_status_idx" ON "Note"("contactId", "status");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
