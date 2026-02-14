-- CreateEnum
CREATE TYPE "PullMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "EmailPullMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "status" "PullMessageStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sourceHistoryId" TEXT,

    CONSTRAINT "EmailPullMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailPullMessage_emailAccountId_messageId_key" ON "EmailPullMessage"("emailAccountId", "messageId");

-- CreateIndex
CREATE INDEX "EmailPullMessage_emailAccountId_status_idx" ON "EmailPullMessage"("emailAccountId", "status");

-- CreateIndex
CREATE INDEX "EmailPullMessage_emailAccountId_processedAt_idx" ON "EmailPullMessage"("emailAccountId", "processedAt");

-- AddForeignKey
ALTER TABLE "EmailPullMessage" ADD CONSTRAINT "EmailPullMessage_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
