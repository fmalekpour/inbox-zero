import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";

export async function getCurrentHistoryId(
  gmail: gmail_v1.Gmail,
): Promise<string | null> {
  const profile = await withGmailRetry(() =>
    gmail.users.getProfile({ userId: "me" }),
  );

  return profile.data.historyId ?? null;
}
