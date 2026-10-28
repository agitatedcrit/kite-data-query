import { Snapshots } from "./snapshots.mjs";
import { fileURLToPath } from "node:url";
import { service } from "./service.mjs";
import { json } from "./http.mjs";
const queries = new Snapshots(
  process.env.DATASET_FILE ||
    fileURLToPath(new URL("../data/snapshot.json", import.meta.url)),
  { maxAgeMs: Number(process.env.DATASET_MAX_AGE_MS || 86400000) },
);
if (process.env.DATASET_AUTO_REFRESH !== "false") {
  const refresh = () =>
    queries
      .refresh({
        rpcUrl: process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
        count: Number(process.env.DATASET_BLOCK_COUNT || 100),
      })
      .catch(() =>
        console.error(
          "Snapshot refresh failed; check /datasets freshness before querying",
        ),
      );
  void refresh();
  const interval = Number(process.env.DATASET_REFRESH_MS || 900000);
  if (!Number.isFinite(interval) || interval < 60000)
    throw Error("DATASET_REFRESH_MS must be at least 60000");
  setInterval(refresh, interval).unref();
}
service({
  path: "/v1/data/query",
  port: 4410,
  precheck: (i) => queries.precheck(i),
  execute: ({ input }) => queries.execute(input),
  extraRoute: async (req, res, path) => {
    if (req.method !== "GET" || path !== "/datasets") return false;
    json(res, 200, {
      ...queries.status(),
      query_types: ["recent_blocks", "gas_summary"],
    });
    return true;
  },
}).start();
