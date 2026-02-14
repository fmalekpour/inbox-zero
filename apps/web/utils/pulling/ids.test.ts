import { describe, expect, it } from "vitest";
import { buildPullingMessageJobId } from "@/utils/pulling/ids";

describe("buildPullingMessageJobId", () => {
  it("builds deterministic job ids", () => {
    expect(
      buildPullingMessageJobId({
        emailAccountId: "account_1",
        messageId: "msg_1",
      }),
    ).toBe("account_1:msg_1");
  });
});
