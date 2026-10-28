import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Snapshots } from "./snapshots.mjs";
import { hash } from "./store.mjs";
const original = JSON.parse(
  readFileSync(new URL("../data/snapshot.json", import.meta.url)),
);
function snapshot(number, at) {
  const s = structuredClone(original);
  s.rows[0].number = number;
  s.as_of = at;
  s.rows_hash = hash(s.rows);
  s.dataset_version = "kite-blocks-" + s.rows_hash.slice(0, 16);
  return s;
}
test("atomic file replacement loads without restart and retains a bounded original version", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "snapshots-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "snapshot.json");
  const at = "2026-10-28T00:00:00Z",
    a = snapshot("30000000", at),
    b = snapshot("30000001", at);
  writeFileSync(file, JSON.stringify(a));
  const q = new Snapshots(file, { now: () => Date.parse(at) + 1000 });
  const input = {
    operation_id: "purchase",
    dataset_version: a.dataset_version,
    query_type: "recent_blocks",
    limit: 1,
  };
  q.precheck(input);
  writeFileSync(file, JSON.stringify(b));
  assert.equal(q.status().dataset_version, b.dataset_version);
  assert.equal(q.execute(input).rows[0].number, "30000000");
  writeFileSync(file, "invalid-json");
  assert.equal(q.status().dataset_version, b.dataset_version);
  assert(q.status().last_reload_error);
  const revoked = structuredClone(b);
  revoked.rights.approved = false;
  writeFileSync(file, JSON.stringify(revoked));
  assert.equal(q.status().permission_revoked, true);
  assert.throws(() => q.execute(input), { code: "source_permission_revoked" });
});
test("failed refresh preserves last good dataset and exposes failure and staleness", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "snapshots-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "snapshot.json");
  writeFileSync(file, JSON.stringify(original));
  const q = new Snapshots(file, {
    now: () => Date.parse(original.as_of) + 86400001,
    captureSource: async () => {
      throw Object.assign(Error(), { code: "source_down" });
    },
  });
  await assert.rejects(q.refresh());
  assert.equal(q.status().last_refresh_error, "source_down");
  assert.equal(q.status().fresh, false);
});
