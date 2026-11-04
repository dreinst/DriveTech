import { test } from "node:test";
import assert from "node:assert/strict";

import { batasPembayaran } from "../src/lib/domain/tenggat.ts";

const dibuat = "2026-11-04T06:41:21.000Z"; // 13.41 WIB
const duaJam = new Date("2026-11-04T08:41:21.000Z");
const unpaid = { status: "unpaid" as const, updated_at: dibuat };

test("tanpa tahan_sampai: batas = dibuat + 2 jam", () => {
  const batas = batasPembayaran({ status: "pending_payment", created_at: dibuat }, unpaid);
  assert.equal(batas?.toISOString(), duaJam.toISOString());
});

test("tahan_sampai lebih lambat: batas ikut tahan_sampai", () => {
  const tahan = "2026-11-05T16:59:59.000Z"; // Kamis 23.59 WIB
  const batas = batasPembayaran({ status: "pending_payment", created_at: dibuat, tahan_sampai: tahan }, unpaid);
  assert.equal(batas?.toISOString(), tahan);
});

test("tahan_sampai lebih awal dari 2 jam: batas tetap dibuat + 2 jam", () => {
  const batas = batasPembayaran(
    { status: "pending_payment", created_at: dibuat, tahan_sampai: "2026-11-04T07:00:00.000Z" },
    unpaid,
  );
  assert.equal(batas?.toISOString(), duaJam.toISOString());
});

test("tahan_sampai dalam bentuk Date juga dibaca", () => {
  const tahan = new Date("2026-11-05T16:59:59.000Z");
  const batas = batasPembayaran({ status: "pending_payment", created_at: dibuat, tahan_sampai: tahan }, unpaid);
  assert.equal(batas?.toISOString(), tahan.toISOString());
});

test("bukti sudah dikirim atau booking bukan pending_payment: tidak ada tenggat", () => {
  const tahan = "2026-11-05T16:59:59.000Z";
  assert.equal(
    batasPembayaran({ status: "pending_payment", created_at: dibuat, tahan_sampai: tahan }, { status: "submitted", updated_at: dibuat }),
    null,
  );
  assert.equal(batasPembayaran({ status: "confirmed", created_at: dibuat, tahan_sampai: tahan }, unpaid), null);
});
