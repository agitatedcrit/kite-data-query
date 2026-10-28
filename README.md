# Data Query

Versioned parameterized queries over operator-owned licensed snapshots.

Version 0.2.0 is an AI-assisted engineering evaluation release, developed under one operator and assigned to this GitHub account. It is not evidence of independent human adoption, official Kite approval, Electric Capital inclusion or successful live payment.

## Run and verify

Node.js 20.11+ is required; Node.js 24 is used for current CI and is recommended.

```sh
npm ci
npm test
# Inspect data/snapshot.json freshness before starting:
npm start
```

The included snapshot is a real read-only Kite testnet RPC observation, not fabricated market data. It contains factual block number/hash, timestamp, gas used and transaction count. The independently assembled selection is dedicated by this project to CC0; no third-party proprietary feed is bundled. Inspect exact source, capture time, network and version under data/snapshot.json. No customer demand or exclusive data advantage is claimed.

POST /v1/data/query supports recent_blocks and gas_summary, decimal-string block_min/block_max filters and limits 1–100. Raw SQL, unknown filters, wrong versions and stale datasets are refused before payment. A zero-row successful query is billable under the disclosed fixed-page contract; failures are not converted to empty rows. Pagination never starts another purchase automatically.

GET /datasets describes source, version, terms, refresh errors and both observation/block freshness. The default freshness ceiling is 24 hours. By default the server attempts refresh on startup and every 15 minutes, retaining recent versions for concurrent requests. Atomic replacements made by scripts/refresh.mjs are also loaded without restart. Set DATASET_AUTO_REFRESH=false for deterministic offline fixtures; an expired fixture correctly stops serving paid queries. The result includes as_of and truncation. BigInt aggregation preserves exact gas totals.

## Configuration and recovery

Use .env.example as a list of required environment variables; the service does not automatically load it. Generate a fresh 32-byte hex DATA_KEY locally, keep it outside the repository and retain it across restarts. Supply strong operator/application bearer tokens and a real receiver and asset before enabling a service. Values are intentionally blank so example configuration cannot silently charge a wrong wallet. The stored payment state UNKNOWN never means unpaid. Inspect the original receipt/activity and restricted journal; do not change an operation key to buy again. Where a writer lock survives a crash, stop all writer processes and review the journal before removing only the stale lock directory.

## Integration evidence

Read [compatibility.json](compatibility.json) and [the protocol boundary](docs/PROTOCOL.md). Local tests are E1; read-only public capability/RPC observations prove only the facts observed. Real Passport approval, funded purchase, SIWX interoperability, public deployment and catalog/EC review are not completed by this release. The service manifest stays draft and uses placeholder pay_to until a genuine receiver and deployment are configured.

## Scope and evidence

[Original PRD](docs/PRD.md) describes the full target, not a claim that every external acceptance gate has passed. [Event contract](docs/EVENTS.md) defines the application records. The standalone repositories share protocol/storage support code, with distinct business implementations and tests. The license is MIT; third-party dependencies keep their upstream licenses. Reproduce failures without publishing payment signatures, account credentials or private files.

## 2026-10-28 update

The service automatically attempts read-only snapshot refresh at startup and every DATASET_REFRESH_MS (default 15 minutes). DATASET_BLOCK_COUNT defaults to 100, bounded by capture's maximum. DATASET_AUTO_REFRESH=false disables network refresh for deterministic fixtures. Every request observes atomic file replacements without restarting; up to eight recent in-memory versions preserve the dataset chosen by a concurrent purchase. A request for an evicted version gets a version mismatch, never silently different rows. /datasets reports observation freshness, newest block time, source/indexed head at capture, available versions and refresh/reload errors. Source block age is distinct from collection age; a recently observed stalled chain is not called recent chain activity. Failure preserves the last good snapshot, which is still refused once stale.

See [Kite integration and interoperability boundaries](docs/KITE-INTEGRATION.md) and [this release's changes](CHANGELOG.md).
