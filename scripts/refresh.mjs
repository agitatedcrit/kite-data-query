import { capture } from "../src/query.mjs";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
const snapshot = await capture({
  rpcUrl: process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
  count: Number(process.env.DATASET_BLOCK_COUNT || 100),
});
mkdirSync(new URL("../data", import.meta.url), { recursive: true });
const target = new URL("../data/snapshot.json", import.meta.url),
  temp = new URL("../data/snapshot.json.tmp", import.meta.url);
writeFileSync(temp, JSON.stringify(snapshot, null, 2) + "\n");
renameSync(temp, target);
console.log(
  JSON.stringify({
    dataset_version: snapshot.dataset_version,
    as_of: snapshot.as_of,
    rows: snapshot.rows.length,
  }),
);
