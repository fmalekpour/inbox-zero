import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { createScopedLogger } from "@/utils/logger";
import { getWebhookEmailAccount, validateWebhookAccount } from "@/utils/webhook/validate-webhook-account";
import type { PullingMessageJob } from "@/utils/pulling/queues";

const logger = createScopedLogger("pulling-processor");

export async function processPullingMessage(job: PullingMessageJob) {
  if (!env.PULLING_ENABLED) {
    logger.info("Pulling disabled, skipping message", job);
    return;
  }

  const { emailAccountId, messageId, threadId } = job;
  const scopedLogger = logger.with({ emailAccountId, messageId, threadId });

  await prisma.emailPullMessage.upsert({
    where: { emailAccountId_messageId: { emailAccountId, messageId } },
    create: {
      emailAccountId,
      messageId,
      threadId,
      status: "PROCESSING",
      attemptCount: 1,
      lastAttemptAt: new Date(),
    },
    update: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });

  if (env.PULLING_DRY_RUN) {
    await prisma.emailPullMessage.update({
      where: { emailAccountId_messageId: { emailAccountId, messageId } },
      data: { status: "SKIPPED", processedAt: new Date() },
    });
    scopedLogger.info("Dry run enabled, skipping processing");
    return;
  }

  const emailAccount = await getWebhookEmailAccount({ id: emailAccountId }, scopedLogger);
  const validation = await validateWebhookAccount(emailAccount, scopedLogger);
  if (!validation.success) {
    await prisma.emailPullMessage.update({
      where: { emailAccountId_messageId: { emailAccountId, messageId } },
      data: { status: "FAILED", lastError: "Account validation failed" },
    });
    return;
  }

  const lockAcquired = await markMessageAsProcessing({
    userEmail: validation.data.emailAccount.email,
    messageId,
  });

  if (!lockAcquired) {
    await prisma.emailPullMessage.update({
      where: { emailAccountId_messageId: { emailAccountId, messageId } },
      data: { status: "PENDING" },
    });
    scopedLogger.info("Message already processing elsewhere");
    return;
  }

  try {
    const provider = await createEmailProvider({
      emailAccountId,
      provider: validation.data.emailAccount.account.provider,
      logger: scopedLogger,
    });

    await processHistoryItemShared(
      { messageId, threadId },
      {
        provider,
        emailAccount: validation.data.emailAccount,
        hasAutomationRules: validation.data.hasAutomationRules,
        hasAiAccess: validation.data.hasAiAccess,
        rules: validation.data.emailAccount.rules,
        logger: scopedLogger,
      },
    );

    await prisma.emailPullMessage.update({
      where: { emailAccountId_messageId: { emailAccountId, messageId } },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    scopedLogger.error("Failed to process message", { error });
    await prisma.emailPullMessage.update({
      where: { emailAccountId_messageId: { emailAccountId, messageId } },
      data: {
        status: "FAILED",
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
