import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_DATABASE_URL,
  looksLikePooler,
  resolveDatabaseUrl,
} from "../../../e2e/support/db-target.mjs";

describe("resolveDatabaseUrl", () => {
  it("falls back to the disposable local database", () => {
    expect(resolveDatabaseUrl({})).toBe(DEFAULT_LOCAL_DATABASE_URL);
  });

  it("honours an explicit override", () => {
    const url = "postgres://u:p@db.internal:5432/parking_test";
    expect(resolveDatabaseUrl({ E2E_DATABASE_URL: url })).toBe(url);
  });
});

describe("looksLikePooler", () => {
  it("detects the Supabase pooler host and port", () => {
    expect(looksLikePooler("postgres://u:p@aws-0-us-east-2.pooler.supabase.com:5432/db")).toBe(true);
    expect(looksLikePooler("postgres://u:p@127.0.0.1:6543/db")).toBe(true);
  });

  it("accepts a direct local connection", () => {
    expect(looksLikePooler(DEFAULT_LOCAL_DATABASE_URL)).toBe(false);
  });
});
