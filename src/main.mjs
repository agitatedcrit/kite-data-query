import { readFileSync } from "node:fs";
import { Queries } from "./query.mjs";
import { service } from "./service.mjs";
import { json } from "./http.mjs";
const queries = new Queries(
  JSON.parse(
    readFileSync(
      process.env.DATASET_FILE ||
        new URL("../data/snapshot.json", import.meta.url),
    ),
  ),
  { maxAgeMs: Number(process.env.DATASET_MAX_AGE_MS || 86400000) },
);
service({
  path: "/v1/data/query",
  port: 4410,
  precheck: (i) => queries.precheck(i),
  execute: ({ input }) => queries.execute(input),
  extraRoute: async (req, res, path) => {
    if (req.method !== "GET" || path !== "/datasets") return false;
    const s = queries.snapshot;
    json(res, 200, {
      dataset_version: s.dataset_version,
      as_of: s.as_of,
      rights: s.rights,
      source: s.source,
      query_types: ["recent_blocks", "gas_summary"],
      fresh: Date.now() - Date.parse(s.as_of) <= queries.maxAgeMs,
    });
    return true;
  },
}).start();
