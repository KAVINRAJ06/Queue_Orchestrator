import { describe, expect, it } from "vitest";
import { claimNextJobSql } from "../src/services/scheduler.js";

describe("atomic claim SQL", () => {
  it("uses row-level locking with skip locked", () => {
    expect(claimNextJobSql.toLowerCase()).toContain("for update skip locked");
  });

  it("respects queue pause and concurrency before claiming", () => {
    const sql = claimNextJobSql.toLowerCase();
    expect(sql).toContain("q.paused = false");
    expect(sql).toContain("active.state in ('claimed', 'running')");
    expect(sql).toContain("< q.concurrency_limit");
  });

  it("claims only eligible queued jobs and returns the updated row", () => {
    const sql = claimNextJobSql.toLowerCase();
    expect(sql).toContain("j.state = 'queued'");
    expect(sql).toContain("locked_until is null");
    expect(sql).toContain("returning j.*");
  });
});
