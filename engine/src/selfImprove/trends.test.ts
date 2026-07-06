import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { default as Database } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// trends.ts computes DATA_DIR = join(NEXUS_DATA_DIR, "nexus"), then opens nexus.db inside.
// Set NEXUS_DATA_DIR to a temp parent so the actual DB ends up at TEST_DIR/nexus/nexus.db.
const TEST_PARENT = join(process.env.TEMP ?? "/tmp", `nexus-test-${randomUUID().slice(0, 8)}`);
const TEST_DIR = join(TEST_PARENT, "nexus");
mkdirSync(TEST_DIR, { recursive: true });
process.env.NEXUS_DATA_DIR = TEST_PARENT;

const DB_PATH = join(TEST_DIR, "nexus.db");

// Ensure the evaluations table exists (normally created by evaluate.ts)
const setupDb = new Database(DB_PATH);
setupDb.pragma("journal_mode = WAL");
setupDb.exec(`CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY, completion INTEGER NOT NULL, satisfaction INTEGER NOT NULL,
  efficiency INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL
)`);
setupDb.close();

// Import trends.ts AFTER setting the env var so it uses the test DB
const { checkTrend, getLatestTrend, listTrends } = await import("./trends.ts");

// Helper: insert evaluation rows directly
function insertEval(satisfaction: number, createdAt?: number) {
  const db = new Database(DB_PATH);
  const id = `eval-${randomUUID().slice(0, 8)}`;
  db.prepare("INSERT INTO evaluations (id, completion, satisfaction, efficiency, note, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, 70, satisfaction, 70, null, createdAt ?? Date.now());
  db.close();
}

beforeEach(() => {
  const db = new Database(DB_PATH);
  db.exec("DELETE FROM evaluations");
  db.exec("DELETE FROM evaluation_trends");
  db.close();
});

describe("checkTrend()", () => {
  it("returns null with fewer than 2 evaluations", () => {
    insertEval(80);
    expect(checkTrend()).toBeNull();
  });

  it("returns stable when scores are flat", () => {
    for (let i = 0; i < 10; i++) insertEval(60, Date.now() + i);
    const trend = checkTrend();
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe("stable");
    expect(trend!.alerted).toBe(false);
  });

  it("returns improving when recent scores are much higher", () => {
    for (let i = 0; i < 15; i++) insertEval(30, 1000 + i);
    for (let i = 0; i < 5; i++) insertEval(80, 2000 + i);
    const trend = checkTrend();
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe("improving");
    expect(trend!.delta_5v20).toBeGreaterThan(5);
  });

  it("returns declining when recent scores are much lower", () => {
    for (let i = 0; i < 15; i++) insertEval(80, 1000 + i);
    for (let i = 0; i < 5; i++) insertEval(20, 2000 + i);
    const trend = checkTrend();
    expect(trend).not.toBeNull();
    expect(trend!.direction).toBe("declining");
    expect(trend!.delta_5v20).toBeLessThan(-15);
    expect(trend!.alerted).toBe(true);
  });

  it("detects consecutive low scores (3+ with satisfaction < 40)", () => {
    for (let i = 0; i < 5; i++) insertEval(70, 1000 + i);
    for (let i = 0; i < 3; i++) insertEval(30, 2000 + i);
    const trend = checkTrend();
    expect(trend).not.toBeNull();
    expect(trend!.consecutive_low).toBe(3);
    expect(trend!.alerted).toBe(true);
  });

  it("resets consecutive low count when a good score appears", () => {
    for (let i = 0; i < 3; i++) insertEval(20, 1000 + i);
    insertEval(80, 2000);
    insertEval(25, 3000);
    const trend = checkTrend();
    expect(trend).not.toBeNull();
    expect(trend!.consecutive_low).toBe(1);
  });

  it("stores the trend record in the database", () => {
    for (let i = 0; i < 5; i++) insertEval(60, Date.now() + i);
    checkTrend();
    const trends = listTrends(10);
    expect(trends.length).toBeGreaterThanOrEqual(1);
    expect(trends[0].direction).toBeDefined();
    expect(typeof trends[0].delta_5v20).toBe("number");
  });
});

describe("getLatestTrend()", () => {
  it("returns null when no trends exist", () => {
    expect(getLatestTrend()).toBeNull();
  });

  it("returns the most recent trend", () => {
    for (let i = 0; i < 5; i++) insertEval(60, 1000 + i);
    checkTrend();
    for (let i = 0; i < 5; i++) insertEval(10, 2000 + i);
    checkTrend();
    const latest = getLatestTrend();
    expect(latest).not.toBeNull();
    // The latest should reflect the very low scores → declining
    expect(latest!.direction).toBe("declining");
  });
});

describe("listTrends()", () => {
  it("returns empty array when no trends exist", () => {
    expect(listTrends()).toEqual([]);
  });

  it("returns trends in reverse chronological order", () => {
    for (let i = 0; i < 5; i++) insertEval(60, 1000 + i);
    checkTrend();
    for (let i = 0; i < 5; i++) insertEval(80, 2000 + i);
    checkTrend();
    const trends = listTrends(10);
    expect(trends.length).toBe(2);
    expect(trends[0].created_at).toBeGreaterThanOrEqual(trends[1].created_at);
  });

  it("respects the limit parameter", () => {
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 3; i++) insertEval(60, round * 1000 + i);
      checkTrend();
    }
    const trends = listTrends(3);
    expect(trends.length).toBeLessThanOrEqual(3);
  });
});
