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

  // ─── GitHub Org Repository Health ─────────────────────────────────────────────

  /**
   * Health metrics for a single GitHub repository.
   * 
   * These metrics are chosen because they signal different things:
   * - stars: community interest and discovery
   * - forks: active usage and contribution intent  
   * - openIssues: workload and community engagement
   * - watchers: people actively following development
   * - subscribers: people who want notifications (different from watchers)
   * 
   * Tracking these longitudinally tells us whether a repo is growing,
   * plateauing, or declining — which is exactly what the observability
   * project is designed to surface.
   */
  export interface RepoHealthMetrics {
    owner: string;           // e.g. "json-schema-org"
    repo: string;            // e.g. "json-schema-spec"
    fullName: string;        // e.g. "json-schema-org/json-schema-spec"
    description: string;     // repo description from GitHub
    stars: number;           // stargazer count
    forks: number;           // fork count
    openIssues: number;      // open issues + open PRs (GitHub combines these)
    watchers: number;        // watcher count
    isArchived: boolean;     // archived repos need flagging — declining signal
    defaultBranch: string;   // useful metadata
    lastPushedAt: string;    // ISO timestamp of last push — activity signal
  }

  /**
   * The full org health snapshot for one collection run.
   */
  export interface OrgHealthSnapshot extends TimestampedRecord {
    organization: string;
    repositories: RepoHealthMetrics[];
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
    orgHealth: OrgHealthSnapshot;
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
    jsonSchemaSpecStars: number;
  }
  
  export interface HistoryFile {
    lastUpdated: string;
    totalRuns: number;
    entries: HistoryEntry[];
  }