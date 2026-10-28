import { fault, hash } from "./store.mjs";
export function validateSnapshot(s) {
  if (
    s.schema_version !== 1 ||
    s.rights?.license !== "CC0-1.0" ||
    !s.rights?.approved ||
    s.source?.network !== "eip155:2368" ||
    !s.source?.rpc_url?.startsWith("https://") ||
    !Number.isFinite(Date.parse(s.as_of)) ||
    !Array.isArray(s.rows) ||
    !s.rows.length ||
    s.rows.length > 2000
  )
    throw fault("dataset_rights_or_schema_invalid", 503);
  for (const r of s.rows)
    if (
      !/^\d+$/.test(r.number) ||
      !/^\d+$/.test(r.gas_used) ||
      !/^0x[0-9a-f]{64}$/i.test(r.hash) ||
      !Number.isInteger(r.transaction_count) ||
      r.transaction_count < 0 ||
      !Number.isInteger(r.timestamp) ||
      r.timestamp < 0
    )
      throw fault("dataset_row_invalid", 503);
  if (
    hash(s.rows) !== s.rows_hash ||
    s.dataset_version !== "kite-blocks-" + s.rows_hash.slice(0, 16)
  )
    throw fault("dataset_integrity_failed", 503);
  return s;
}
export class Queries {
  constructor(snapshot, { maxAgeMs = 86400000, now = () => Date.now() } = {}) {
    this.snapshot = validateSnapshot(snapshot);
    Object.assign(this, { maxAgeMs, now });
  }
  precheck(input) {
    const s = this.snapshot;
    if (!s.rights.approved) throw fault("source_permission_revoked", 503);
    if (
      Date.parse(s.as_of) - this.now() > 60000 ||
      this.now() - Date.parse(s.as_of) > this.maxAgeMs
    )
      throw fault("dataset_stale", 503);
    if (input.dataset_version !== s.dataset_version)
      throw fault("dataset_version_mismatch", 409);
    if (
      !["recent_blocks", "gas_summary"].includes(input.query_type) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    )
      throw fault("query_template_or_limit_invalid");
    const filters = input.filters || {};
    if (
      Object.keys(filters).some(
        (k) => !["block_min", "block_max"].includes(k),
      ) ||
      Object.values(filters).some(
        (v) => typeof v !== "string" || !/^\d{1,20}$/.test(v),
      )
    )
      throw fault("invalid_filter");
    if (
      filters.block_min &&
      filters.block_max &&
      BigInt(filters.block_min) > BigInt(filters.block_max)
    )
      throw fault("invalid_block_range");
    return input;
  }
  execute(input) {
    this.precheck(input);
    const s = this.snapshot,
      f = input.filters || {},
      matches = s.rows
        .filter(
          (r) =>
            (!f.block_min || BigInt(r.number) >= BigInt(f.block_min)) &&
            (!f.block_max || BigInt(r.number) <= BigInt(f.block_max)),
        )
        .sort((a, b) => (BigInt(a.number) > BigInt(b.number) ? -1 : 1));
    const rows =
      input.query_type === "recent_blocks"
        ? matches.slice(0, input.limit)
        : [
            {
              blocks: matches.length,
              total_gas_used: matches
                .reduce((n, r) => n + BigInt(r.gas_used), 0n)
                .toString(),
              transactions: matches.reduce(
                (n, r) => n + r.transaction_count,
                0,
              ),
              minimum_block: matches.at(-1)?.number || null,
              maximum_block: matches[0]?.number || null,
            },
          ];
    return {
      query_id: input.operation_id,
      dataset_version: s.dataset_version,
      as_of: s.as_of,
      source: s.source,
      license_summary: s.rights.summary,
      rows,
      truncated:
        input.query_type === "recent_blocks" && matches.length > input.limit,
      total_matching: matches.length,
      billing: {
        spec_version: "query-v1",
        one_page: true,
        zero_rows_billable: true,
        automatic_pagination: false,
      },
    };
  }
}
export async function capture({
  rpcUrl = "https://rpc-testnet.gokite.ai/",
  count = 20,
  fetcher = fetch,
} = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw fault("capture_limit");
  const rpc = async (method, params = []) => {
    const r = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!r.ok) throw fault("source_failed", 503);
    const wire = await r.json();
    if (wire.error || wire.result === undefined)
      throw fault("source_failed", 503);
    return wire.result;
  };
  if (BigInt(await rpc("eth_chainId")) !== 2368n)
    throw fault("source_chain_mismatch", 503);
  const head = BigInt(await rpc("eth_blockNumber")),
    rows = [];
  const captureBlock = async (i) => {
    const block = await rpc("eth_getBlockByNumber", [
      "0x" + (head - BigInt(i)).toString(16),
      false,
    ]);
    if (!block) throw fault("source_missing_block", 503);
    return {
      number: BigInt(block.number).toString(),
      hash: block.hash,
      timestamp: Number(BigInt(block.timestamp)),
      gas_used: BigInt(block.gasUsed).toString(),
      transaction_count: block.transactions.length,
      parent_hash: block.parentHash,
    };
  };
  for (let i = 0; i < count; i += 4) {
    rows.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(4, count - i) }, (_, j) =>
          captureBlock(i + j),
        ),
      )),
    );
  }
  for (let i = 0; i < rows.length - 1; i++)
    if (BigInt(rows[i].number) - 1n !== BigInt(rows[i + 1].number))
      throw fault("snapshot_gap", 503);
    else if (rows[i].parent_hash && rows[i].parent_hash !== rows[i + 1].hash)
      throw fault("snapshot_reorg", 503);
  const rows_hash = hash(rows);
  return validateSnapshot({
    schema_version: 1,
    dataset_version: "kite-blocks-" + rows_hash.slice(0, 16),
    as_of: new Date().toISOString(),
    rows_hash,
    source: {
      network: "eip155:2368",
      rpc_url: rpcUrl,
      method: "eth_getBlockByNumber",
      kind: "operator_observed_public_chain_facts",
      head_block: head.toString(),
    },
    rights: {
      approved: true,
      license: "CC0-1.0",
      summary:
        "Operator dedicates this independently collected factual block-metadata selection to CC0. No private or third-party proprietary dataset is redistributed.",
    },
    rows,
  });
}
