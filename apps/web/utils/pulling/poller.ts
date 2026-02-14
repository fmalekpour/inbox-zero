import prisma from "@/utils/prisma";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { getWebhookEmailAccount, validateWebhookAccount } from "@/utils/webhook/validate-webhook-account";
import { getGmailClientForEmail } from "@/utils/account";
import { getHistory } from "@/utils/gmail/history";
import { getCurrentHistoryId } from "@/utils/gmail/profile";
import { getPullingMessageQueue } from "@/utils/pulling/queues";
import { buildPullingMessageJobId } from "@/utils/pulling/ids";
import { updateLastSyncedHistoryId } from "@/utils/pulling/sync-state";

const logger = createScopedLogger("pulling-poller");

const HISTORY_TYPES = ["messageAdded"];

function isHistoryIdExpiredError(error: unknown): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: we need to read response shape
  const err = error as any;
  const statusCode =
    err.response?.data?.error?.code ??
    err.response?.status ??
    err.status ??
    err.code;

  return statusCode === 404;
}

export async function pollAllAccounts() {
  if (!env.PULLING_ENABLED) {
    logger.info("Pulling disabled, skipping poll");
    return;
  }

  const accounts = await prisma.emailAccount.findMany({
    where: {
      account: {
        provider: "google",
        disconnectedAt: null,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  for (const account of accounts) {
    await pollSingleAccount(account.id, account.email);
  }
}

async function pollSingleAccount(emailAccountId: string, email: string) {
  const accountLogger = logger.with({ emailAccountId, email });

  const emailAccount = await getWebhookEmailAccount({ id: emailAccountId }, accountLogger);
  const validation = await validateWebhookAccount(emailAccount, accountLogger);
  if (!validation.success) return;

  const validatedAccount = validation.data.emailAccount;

  const gmail = await getGmailClientForEmail({ emailAccountId, logger: accountLogger });

  if (!validatedAccount.lastSyncedHistoryId) {
    const currentHistoryId = await getCurrentHistoryId(gmail);
    await updateLastSyncedHistoryId({
      emailAccountId,
      lastSyncedHistoryId: currentHistoryId,
    });
    accountLogger.info("Initialized history cursor", { currentHistoryId });
    return;
  }

  try {
    const history = await getHistory(gmail, {
      startHistoryId: validatedAccount.lastSyncedHistoryId,
      historyTypes: HISTORY_TYPES,
      maxResults: 500,
    });

    const messageItems = new Map<string, { messageId: string; threadId?: string; sourceHistoryId?: string }>();

    for (const entry of history.history ?? []) {
      for (const messageAdded of entry.messagesAdded ?? []) {
        const messageId = messageAdded.message?.id;
        if (!messageId) continue;
        messageItems.set(messageId, {
          messageId,
          threadId: messageAdded.message?.threadId || undefined,
          sourceHistoryId: entry.id || undefined,
        });
      }
    }

    for (const item of messageItems.values()) {
      await enqueuePullingMessage({
        emailAccountId,
        messageId: item.messageId,
        threadId: item.threadId,
        sourceHistoryId: item.sourceHistoryId,
      });
    }

    const lastHistoryId =
      history.history?.[history.history.length - 1]?.id ?? history.historyId ?? null;

    await updateLastSyncedHistoryId({
      emailAccountId,
      lastSyncedHistoryId: lastHistoryId,
    });

    accountLogger.info("Polling completed", {
      newMessages: messageItems.size,
      lastHistoryId,
    });
  } catch (error) {
    if (isHistoryIdExpiredError(error)) {
      const currentHistoryId = await getCurrentHistoryId(gmail);
      await updateLastSyncedHistoryId({
        emailAccountId,
        lastSyncedHistoryId: currentHistoryId,
      });
      accountLogger.warn("History cursor expired, reset", { currentHistoryId });
      return;
    }

    accountLogger.error("Polling failed", { error });
  }
}

async function enqueuePullingMessage(options: {
  emailAccountId: string;
  messageId: string;
  threadId?: string;
  sourceHistoryId?: string;
}) {
  const { emailAccountId, messageId, threadId, sourceHistoryId } = options;

  const existing = await prisma.emailPullMessage.findUnique({
    where: { emailAccountId_messageId: { emailAccountId, messageId } },
    select: { status: true },
  });

  if (existing?.status === "PROCESSED" || existing?.status === "SKIPPED") {
    return;
  }

  await prisma.emailPullMessage.upsert({
    where: { emailAccountId_messageId: { emailAccountId, messageId } },
    create: {
      emailAccountId,
      messageId,
      threadId,
      sourceHistoryId,
    },
    update: {
      status: "PENDING",
      threadId,
      sourceHistoryId,
      lastError: null,
    },
  });

  await getPullingMessageQueue().add(
    "process-message",
    { emailAccountId, messageId, threadId, sourceHistoryId },
    { jobId: buildPullingMessageJobId({ emailAccountId, messageId }) },
  );
}
