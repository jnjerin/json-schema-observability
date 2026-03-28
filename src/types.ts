/**
 * types.ts
 * 
 * Central type definitions for the entire observability pipeline.
 * Defining types upfront ensures every collector produces consistently
 * shaped data, making the storage and visualization layers predictable
 * and safe to extend later.
 */

// ─── Shared ───────────────────────────────────────────────────────────────────

/**
 * Every snapshot we collect is timestamped so we can track
 * how metrics change over time (longitudinal tracking).
 */
export interface TimestampedRecord {
    collectedAt: string;     // ISO-8601 timestamp of when this data was collected
    collectedAtUnix: number; // Unix timestamp — easier to sort and query
  }
  
  // ─── npm Downloads ────────────────────────────────────────────────────────────
  
  /**
   * Weekly download count for a single npm package.
   * Source: https://api.npmjs.org/downloads/point/last-week/{package}
   */
  export interface NpmPackageDownloads {
    package: string;       // e.g. "ajv"
    downloads: number;     // weekly download count
    start: string;         // start of the measured week
    end: string;           // end of the measured week
  }
  
  /**
   * The full npm snapshot — all packages collected in one run.
   */
  export interface NpmSnapshot extends TimestampedRecord {
    packages: NpmPackageDownloads[];
  }
  
  // ─── GitHub Metrics ───────────────────────────────────────────────────────────
  
  /**
   * Count of public GitHub repositories using the json-schema topic.
   * Source: GitHub Search API
   * 
   * To Note: GitHub search results are approximate for large result sets.
   * We document this as a known limitation rather than hiding it.
   */
  export interface GitHubRepoMetrics {
    topic: string;           // the topic we searched for, e.g. "json-schema"
    totalCount: number;      // total repos with this topic (approximate)
    isApproximate: boolean;  // GitHub flags when counts are approximate
  }
  
  /**
   * The full GitHub snapshot for one run.
   */
  export interface GitHubSnapshot extends TimestampedRecord {
    repos: GitHubRepoMetrics[];
  }
  
  // ─── Bowtie Compliance ────────────────────────────────────────────────────────
  
  /**
   * Compliance score for a single JSON Schema implementation.
   * Source: Bowtie (https://bowtie.report)
   * 
   * Bowtie runs the official JSON Schema test suite against all known
   * implementations and publishes results. This tells us how "correct"
   * each implementation is.
   */
  export interface BowtiImplementationScore {
    name: string;           // implementation name, e.g. "ajv"
    language: string;       // programming language
    draft: string;          // JSON Schema draft, e.g. "2020-12"
    passedTests: number;    // number of tests passed
    totalTests: number;     // total tests run
    complianceRate: number; // passedTests / totalTests as a percentage (0-100)
  }
  
  /**
   * The full Bowtie snapshot for one run.
   */
  export interface BowtieSnapshot extends TimestampedRecord {
    implementations: BowtiImplementationScore[];
    draft: string;          // which draft these results are for
  }
  
  // ─── Combined Snapshot ────────────────────────────────────────────────────────
  
  /**
   * A complete collection run — all metrics together, timestamped once.
   * This is what gets written to data/snapshots/{date}.json
   * and appended to data/history.json
   */
  export interface EcosystemSnapshot {
    runId: string;           // unique ID for this collection run
    collectedAt: string;     // ISO timestamp
    npm: NpmSnapshot;
    github: GitHubSnapshot;
    bowtie: BowtieSnapshot | null; // nullable — Bowtie may be temporarily unavailable
  }
  
  // ─── History ──────────────────────────────────────────────────────────────────
  
  /**
   * The history file structure — an append-only log of all snapshots.
   * This is the core of longitudinal tracking.
   * 
   * Design decision: We store summary data in history (not full snapshots)
   * to keep history.json small and queryable. Full snapshots live in
   * data/snapshots/{date}.json for when you need the complete picture.
   */
  export interface HistoryEntry {
    runId: string;
    collectedAt: string;
    ajvWeeklyDownloads: number;
    jsonSchemaRepoCount: number;
    bowtieTopCompliance: number | null;
  }
  
  export interface HistoryFile {
    lastUpdated: string;
    totalRuns: number;
    entries: HistoryEntry[];
  }