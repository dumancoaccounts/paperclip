import { describe, expect, it } from "vitest";
import {
  createIssueWorkProductSchema,
  updateIssueWorkProductSchema,
} from "./work-product.js";

describe("work product validators", () => {
  it("accepts delivery evidence fields and coerces verification timestamps", () => {
    const parsed = createIssueWorkProductSchema.parse({
      type: "test_result",
      provider: "paperclip",
      title: "Targeted tests",
      evidenceKind: "test_result",
      verificationRole: "minimum_verification",
      satisfiesMinimumVerification: true,
      coversExpectedOutput: false,
      verifiedAt: "2026-03-17T00:00:00.000Z",
      metadata: {
        command: "pnpm vitest work-products.test.ts",
        exitCode: 0,
        passed: true,
      },
    });

    expect(parsed.validity).toBe("current");
    expect(parsed.verifiedAt).toBeInstanceOf(Date);
    expect(parsed.satisfiesMinimumVerification).toBe(true);
  });

  it("rejects manual verification metadata without an observed result", () => {
    const result = createIssueWorkProductSchema.safeParse({
      type: "manual_verification_note",
      provider: "paperclip",
      title: "Manual check",
      evidenceKind: "manual_verification_note",
      metadata: {
        method: "browser QA",
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts stale and superseded updates", () => {
    const parsed = updateIssueWorkProductSchema.parse({
      validity: "superseded",
      supersededByWorkProductId: "11111111-1111-4111-8111-111111111111",
      supersededReason: "Newer test result covers the same role",
    });

    expect(parsed.validity).toBe("superseded");
  });
});
