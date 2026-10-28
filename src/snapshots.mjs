import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Queries, capture, validateSnapshot } from "./query.mjs";
import { fault } from "./store.mjs";

// Keep a bounded set of versions so refresh cannot silently change a purchase's dataset.
export class Snapshots {
  constructor(
    file,
    {
      maxAgeMs = 86400000,
      now = () => Date.now(),
      captureSource = capture,
    } = {},
  ) {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0)
      throw fault("invalid_dataset_max_age");
    Object.assign(this, {
      file,
      maxAgeMs,
      now,
      captureSource,
      versions: new Map(),
      lastError: null,
      refreshing: null,
    });
    this.load();
  }
  install(snapshot) {
    validateSnapshot(snapshot);
    const query = new Queries(snapshot, {
      maxAgeMs: this.maxAgeMs,
      now: this.now,
    });
    this.versions.delete(snapshot.dataset_version);
    this.versions.set(snapshot.dataset_version, query);
    while (this.versions.size > 8)
      this.versions.delete(this.versions.keys().next().value);
    this.current = query;
    return snapshot;
  }
  load() {
    try {
      const snapshot = JSON.parse(readFileSync(this.file, "utf8"));
      if (snapshot.rights?.approved === false) {
        this.revoked = true;
        throw fault("source_permission_revoked", 503);
      }
      this.install(snapshot);
      this.revoked = false;
      this.reloadError = null;
    } catch (e) {
      this.reloadError = e.code || "snapshot_reload_failed";
      if (!this.current) throw e;
    }
    return this.current.snapshot;
  }
  engine(input) {
    // A file replacement is observed before each new request, without restarting.
    this.load();
    if (this.revoked) throw fault("source_permission_revoked", 503);
    const engine = this.versions.get(input.dataset_version);
    if (!engine) throw fault("dataset_version_mismatch", 409);
    return engine;
  }
  precheck(input) {
    return this.engine(input).precheck(input);
  }
  execute(input) {
    return this.engine(input).execute(input);
  }
  status() {
    this.load();
    const s = this.current.snapshot;
    const newest = s.rows.reduce((a, b) =>
      BigInt(a.number) > BigInt(b.number) ? a : b,
    );
    return {
      dataset_version: s.dataset_version,
      as_of: s.as_of,
      source: s.source,
      rights: { ...s.rights, approved: !this.revoked && s.rights.approved },
      permission_revoked: Boolean(this.revoked),
      rows: s.rows.length,
      indexed_head: newest.number,
      source_head_at_capture: s.source.head_block || newest.number,
      newest_block_at: new Date(newest.timestamp * 1000).toISOString(),
      source_block_age_seconds: Math.max(
        0,
        Math.floor((this.now() - newest.timestamp * 1000) / 1000),
      ),
      observation_age_seconds: Math.max(
        0,
        Math.floor((this.now() - Date.parse(s.as_of)) / 1000),
      ),
      fresh:
        !this.revoked &&
        Date.parse(s.as_of) <= this.now() + 60000 &&
        this.now() - Date.parse(s.as_of) <= this.maxAgeMs,
      last_refresh_error: this.lastError,
      last_reload_error: this.reloadError,
      refreshing: Boolean(this.refreshing),
      available_versions: [...this.versions.keys()],
    };
  }
  async refresh(options = {}) {
    this.load();
    if (this.revoked) throw fault("source_permission_revoked", 503);
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const snapshot = validateSnapshot(await this.captureSource(options));
        mkdirSync(dirname(this.file), { recursive: true });
        const temp = this.file + "." + randomUUID() + ".tmp";
        writeFileSync(temp, JSON.stringify(snapshot, null, 2) + "\n", {
          mode: 0o600,
        });
        renameSync(temp, this.file);
        this.install(snapshot);
        this.lastError = null;
        return snapshot;
      } catch (e) {
        this.lastError = e.code || "source_failed";
        throw e;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}
