// Characterization tests: pin the CURRENT single-branch behavior before any
// multi-branch change lands. These must stay green through the whole refactor.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withRollback,
  expectPgError,
  pickFixtures,
  plate,
} from "./harness.mjs";

const OPEN = "SELECT open_session($1,$2,$3,$4,$5,$6) AS r";
const CLOSE = "SELECT close_session($1,$2,$3) AS r";
const QUOTE = "SELECT quote_exit($1) AS r";

describe("characterization: entry / exit / pricing", () => {
  it("opens a session and allocates an integer ticket", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor } = await pickFixtures(db);
      const id = crypto.randomUUID();

      const { rows } = await db.query(OPEN, [
        id, plate(), auto.id, boxes[0].id, actor.id, "TEST-CHAR",
      ]);

      assert.ok(Number.isInteger(Number(rows[0].r.ticket_number)));
      assert.equal(rows[0].r.box_id, boxes[0].id);
      assert.equal(rows[0].r.session_id, id);
    });
  });

  it("rejects a second open session for the same vehicle", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor } = await pickFixtures(db);
      const p = plate();
      await db.query(OPEN, [crypto.randomUUID(), p, auto.id, boxes[0].id, actor.id, null]);

      await expectPgError(
        db,
        OPEN,
        [crypto.randomUUID(), p, auto.id, boxes[1].id, actor.id, null],
        "estadía abierta",
      );
    });
  });

  it("rejects a second open session on the same box", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor } = await pickFixtures(db);
      await db.query(OPEN, [crypto.randomUUID(), plate(), auto.id, boxes[0].id, actor.id, null]);

      await expectPgError(
        db,
        OPEN,
        [crypto.randomUUID(), plate(), auto.id, boxes[0].id, actor.id, null],
        "estadía abierta",
      );
    });
  });

  it("prices a 5h stay as the largest block plus whole extra hours (R-01)", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor } = await pickFixtures(db);
      const id = crypto.randomUUID();
      await db.query(OPEN, [id, plate(), auto.id, boxes[0].id, actor.id, null]);
      await db.query(
        "UPDATE parking_sessions SET entry_at = now() - interval '4 hours 59 minutes' WHERE id = $1",
        [id],
      );

      const fee = (await db.query(QUOTE, [id])).rows[0].r.fee;

      assert.equal(fee.extra_hours, 1);
      assert.equal(
        Number(fee.total_cents),
        Number(fee.block.amount_cents) + Number(fee.hourly_amount_cents),
      );
    });
  });

  it("charges the first full block for a very short stay", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor } = await pickFixtures(db);
      const id = crypto.randomUUID();
      await db.query(OPEN, [id, plate(), auto.id, boxes[0].id, actor.id, null]);
      await db.query(
        "UPDATE parking_sessions SET entry_at = now() - interval '13 minutes' WHERE id = $1",
        [id],
      );

      const fee = (await db.query(QUOTE, [id])).rows[0].r.fee;

      assert.equal(fee.block.duration_minutes, 60);
      assert.equal(fee.extra_hours, 0);
      assert.equal(Number(fee.total_cents), Number(fee.block.amount_cents));
    });
  });

  it("closes, records a payment, and frees the box", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor, method } = await pickFixtures(db);
      const id = crypto.randomUUID();
      await db.query(OPEN, [id, plate(), auto.id, boxes[0].id, actor.id, null]);
      await db.query(
        "UPDATE parking_sessions SET entry_at = now() - interval '4 hours 59 minutes' WHERE id = $1",
        [id],
      );

      const closed = (await db.query(CLOSE, [id, method.id, actor.id])).rows[0].r;
      const payment = (await db.query(
        "SELECT amount_charged_cents FROM payments WHERE session_id = $1",
        [id],
      )).rows[0];
      const box = (await db.query(
        "SELECT status FROM box_status WHERE id = $1",
        [boxes[0].id],
      )).rows[0];

      assert.equal(Number(payment.amount_charged_cents), Number(closed.final_cents));
      assert.equal(box.status, "available");
    });
  });

  it("refuses to close a session twice", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor, method } = await pickFixtures(db);
      const id = crypto.randomUUID();
      await db.query(OPEN, [id, plate(), auto.id, boxes[0].id, actor.id, null]);
      await db.query(CLOSE, [id, method.id, actor.id]);

      await expectPgError(db, CLOSE, [id, method.id, actor.id], "ya está cerrada");
    });
  });

  it("persists an immutable tariff snapshot on close", async () => {
    await withRollback(async (db) => {
      const { auto, boxes, actor, method } = await pickFixtures(db);
      const id = crypto.randomUUID();
      await db.query(OPEN, [id, plate(), auto.id, boxes[0].id, actor.id, null]);
      await db.query(CLOSE, [id, method.id, actor.id]);

      const snap = (await db.query(
        "SELECT tariff_snapshot FROM parking_sessions WHERE id = $1",
        [id],
      )).rows[0].tariff_snapshot;
      const app = (await db.query(
        "SELECT snapshot FROM tariff_applications WHERE session_id = $1",
        [id],
      )).rows[0].snapshot;

      assert.deepEqual(snap, app);
    });
  });
});
