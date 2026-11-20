// Branch isolation invariants: a session belongs to the branch of its box, the
// ticket sequence is per branch, and a vehicle cannot be open in two branches.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withRollback, pickFixtures, plate } from "./harness.mjs";

const OPEN = "SELECT open_session($1,$2,$3,$4,$5,$6) AS r";

async function secondBranch(db) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const branch = (
    await db.query("INSERT INTO branches (name, code) VALUES ($1,$2) RETURNING id", [
      `Test Norte ${suffix}`,
      `TN${suffix.slice(0, 4)}`,
    ])
  ).rows[0];
  const floor = (
    await db.query(
      "INSERT INTO parking_floors (name, branch_id) VALUES ($1,$2) RETURNING id",
      [`PB ${suffix}`, branch.id],
    )
  ).rows[0];
  const box = (
    await db.query(
      `INSERT INTO parking_boxes (number, branch_id, floor_id)
       VALUES ($1,$2,$3) RETURNING id, number`,
      [`T${suffix.slice(0, 4)}`, branch.id, floor.id],
    )
  ).rows[0];
  return { branch, floor, box };
}

describe("multi-branch isolation", () => {
  it("assigns the session to the branch of its box", async () => {
    await withRollback(async (db) => {
      const { auto, actor } = await pickFixtures(db);
      const { branch, box } = await secondBranch(db);
      await db.query(
        "INSERT INTO cash_shifts (id, opened_by, branch_id) VALUES ($1,$2,$3)",
        [crypto.randomUUID(), actor.id, branch.id],
      );

      const id = crypto.randomUUID();
      const opened = (
        await db.query(OPEN, [id, plate(), auto.id, box.id, actor.id, null])
      ).rows[0].r;

      assert.equal(opened.branch_id, branch.id);
      assert.equal(Number(opened.ticket_number), 1, "a new branch starts at ticket 1");

      const stored = (
        await db.query("SELECT branch_id FROM parking_sessions WHERE id = $1", [id])
      ).rows[0];
      assert.equal(stored.branch_id, branch.id);
    });
  });

  it("keeps ticket sequences independent per branch", async () => {
    await withRollback(async (db) => {
      const { auto, actor, boxes } = await pickFixtures(db);
      const { branch, box } = await secondBranch(db);
      await db.query(
        "INSERT INTO cash_shifts (id, opened_by, branch_id) VALUES ($1,$2,$3)",
        [crypto.randomUUID(), actor.id, branch.id],
      );

      const local = (
        await db.query(OPEN, [crypto.randomUUID(), plate(), auto.id, boxes[0].id, actor.id, null])
      ).rows[0].r;
      const remote = (
        await db.query(OPEN, [crypto.randomUUID(), plate(), auto.id, box.id, actor.id, null])
      ).rows[0].r;

      assert.equal(Number(remote.ticket_number), 1);
      assert.notEqual(Number(remote.ticket_number), Number(local.ticket_number));
    });
  });

  it("scopes box_status by branch", async () => {
    await withRollback(async (db) => {
      const { auto } = await pickFixtures(db);
      const { branch, box } = await secondBranch(db);

      const localCount = (
        await db.query("SELECT count(*)::int AS n FROM box_status WHERE branch_id = $1", [
          branch.id,
        ])
      ).rows[0].n;
      assert.equal(localCount, 1);

      const elsewhere = await db.query(
        "SELECT 1 FROM box_status WHERE branch_id <> $1 AND id = $2",
        [branch.id, box.id],
      );
      assert.equal(elsewhere.rows.length, 0);
      void auto;
    });
  });

  it("rejects the same vehicle open in two branches", async () => {
    await withRollback(async (db) => {
      const { auto, actor, boxes } = await pickFixtures(db);
      const { branch, box } = await secondBranch(db);
      await db.query(
        "INSERT INTO cash_shifts (id, opened_by, branch_id) VALUES ($1,$2,$3)",
        [crypto.randomUUID(), actor.id, branch.id],
      );

      const parked = plate();
      await db.query(OPEN, [crypto.randomUUID(), parked, auto.id, boxes[0].id, actor.id, null]);

      await assert.rejects(
        () => db.query(OPEN, [crypto.randomUUID(), parked, auto.id, box.id, actor.id, null]),
        /estadía abierta/,
      );
    });
  });

  it("allows the same floor name and box number in two branches", async () => {
    await withRollback(async (db) => {
      const { boxes } = await pickFixtures(db);
      const suffix = crypto.randomUUID().slice(0, 6);
      const principal = (
        await db.query("SELECT branch_id FROM parking_boxes WHERE id = $1", [boxes[0].id])
      ).rows[0].branch_id;
      const { branch } = await secondBranch(db);

      const floorA = (
        await db.query(
          "INSERT INTO parking_floors (name, branch_id) VALUES ($1,$2) RETURNING id",
          [`Planta ${suffix}`, principal],
        )
      ).rows[0];
      const floorB = (
        await db.query(
          "INSERT INTO parking_floors (name, branch_id) VALUES ($1,$2) RETURNING id",
          [`Planta ${suffix}`, branch.id],
        )
      ).rows[0];

      const number = `C${suffix.toUpperCase().slice(0, 4)}`;
      await db.query(
        "INSERT INTO parking_boxes (number, branch_id, floor_id) VALUES ($1,$2,$3)",
        [number, principal, floorA.id],
      );
      await db.query(
        "INSERT INTO parking_boxes (number, branch_id, floor_id) VALUES ($1,$2,$3)",
        [number, branch.id, floorB.id],
      );

      const count = (
        await db.query("SELECT count(*)::int AS n FROM parking_boxes WHERE number = $1", [number])
      ).rows[0].n;
      assert.equal(count, 2);
    });
  });
});
