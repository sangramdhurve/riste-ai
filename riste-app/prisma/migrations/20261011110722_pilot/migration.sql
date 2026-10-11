-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "reminderId" TEXT;

-- CreateTable
CREATE TABLE "Heartbeat" (
    "key" TEXT NOT NULL,
    "okAt" TIMESTAMP(3),
    "errorAt" TIMESTAMP(3),
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Heartbeat_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
