# Changes

## 0.2.0 — 2026-10-28

The service automatically attempts read-only snapshot refresh at startup and every DATASET_REFRESH_MS (default 15 minutes). DATASET_BLOCK_COUNT defaults to 100, bounded by capture's maximum. DATASET_AUTO_REFRESH=false disables network refresh for deterministic fixtures. Every request observes atomic file replacements without restarting; up to eight recent in-memory versions preserve the dataset chosen by a concurrent purchase. A request for an evicted version gets a version mismatch, never silently different rows. /datasets reports observation freshness, newest block time, source/indexed head at capture, available versions and refresh/reload errors. Source block age is distinct from collection age; a recently observed stalled chain is not called recent chain activity. Failure preserves the last good snapshot, which is still refused once stale.

This evaluation update retains explicit blocked real-payment, public-hosting and official-listing gates. Prior releases remain available.
