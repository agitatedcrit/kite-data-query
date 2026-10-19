import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Queries, capture } from "./query.mjs";
const snapshot = JSON.parse(
    readFileSync(new URL("../data/snapshot.json", import.meta.url)),
  ),
  query = {
    operation_id: "query-one",
    dataset_version: snapshot.dataset_version,
    query_type: "recent_blocks",
    limit: 3,
    filters: {},
  };
const engine = () =>
  new Queries(structuredClone(snapshot), {
    now: () => Date.parse(snapshot.as_of) + 1000,
  });
test("versioned query yields ordered actual block facts and no implicit pagination", () => {
  const r = engine().execute(query);
  assert.equal(r.rows.length, 3);
  assert.equal(r.truncated, true);
  assert.equal(r.as_of, snapshot.as_of);
  assert(BigInt(r.rows[0].number) > BigInt(r.rows[1].number));
  assert.equal(r.billing.automatic_pagination, false);
});
test("summary exact integer total and declared zero row behavior", () => {
  const e = engine(),
    r = e.execute({ ...query, query_type: "gas_summary" });
  assert.equal(
    r.rows[0].total_gas_used,
    snapshot.rows.reduce((a, b) => a + BigInt(b.gas_used), 0n).toString(),
  );
  const zero = e.execute({ ...query, filters: { block_min: "9999999999999" } });
  assert.deepEqual(zero.rows, []);
  assert.equal(zero.billing.zero_rows_billable, true);
});
test("injection, unknown templates, oversized limits and wrong version rejected", () => {
  for (const invalid of [
    { filters: { sql: "DROP TABLE" } },
    { filters: { block_min: "1 OR 1=1" } },
    { query_type: "raw_sql" },
    { limit: 1001 },
    { dataset_version: "wrong" },
  ])
    assert.throws(() => engine().execute({ ...query, ...invalid }));
});
test("expired or revoked snapshot cannot masquerade as fresh data", () => {
  assert.throws(
    () =>
      new Queries(snapshot, {
        now: () => Date.parse(snapshot.as_of) + 86400001,
      }).execute(query),
    { code: "dataset_stale" },
  );
  const e = engine();
  e.snapshot.rights.approved = false;
  assert.throws(() => e.execute(query), { code: "source_permission_revoked" });
});
test("source error throws without manufacturing an empty refreshed snapshot", async () => {
  await assert.rejects(
    capture({
      fetcher: async () => ({
        ok: true,
        json: async () => ({ error: { message: "rpc down" } }),
      }),
    }),
    { code: "source_failed" },
  );
});
