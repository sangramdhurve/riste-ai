-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('MANUAL', 'AI');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NoteStatus" ADD VALUE 'PROPOSED';
ALTER TYPE "NoteStatus" ADD VALUE 'DISMISSED';

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "source" "NoteSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceMessageId" TEXT;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
