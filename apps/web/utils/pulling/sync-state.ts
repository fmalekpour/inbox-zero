import prisma from "@/utils/prisma";

export async function updateLastSyncedHistoryId(options: {
  emailAccountId: string;
  lastSyncedHistoryId?: string | null;
}) {
  const { emailAccountId, lastSyncedHistoryId } = options;
  if (!lastSyncedHistoryId) return;

  await prisma.$executeRaw`
    UPDATE "EmailAccount"
    SET "lastSyncedHistoryId" = ${lastSyncedHistoryId}, "updatedAt" = NOW()
    WHERE id = ${emailAccountId}
    AND (
      "lastSyncedHistoryId" IS NULL
      OR CAST("lastSyncedHistoryId" AS NUMERIC) < CAST(${lastSyncedHistoryId} AS NUMERIC)
    )
  `;
}
