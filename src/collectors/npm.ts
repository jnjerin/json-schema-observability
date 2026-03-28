/**
 * npm.ts — Collector for npm download statistics
 * 
 * Why npm downloads?
 * Weekly downloads are the most direct signal of developer adoption.
 * When a validator gains or loses downloads, it reflects real usage
 * decisions by real developers. Tracking this over time shows us
 * whether the ecosystem is growing and which implementations
 * developers are choosing.
 * 
 * API used: https://api.npmjs.org/downloads/point/last-week/{package}
 * - No authentication required
 * - Rate limit: generous for our use case (we're fetching ~4 packages)
 * - Returns: { downloads, start, end, package }
 */

import { NpmSnapshot, NpmPackageDownloads } from '../types';

// The packages we track. These are the most widely used JSON Schema
// validators. We track multiple rather than just AJV to show the
// relative adoption landscape across the ecosystem.
const TRACKED_PACKAGES = [
  'ajv',
  'jsonschema',
  '@hyperjump/json-schema',
  'ajv-formats',
] as const;

const NPM_API_BASE = 'https://api.npmjs.org/downloads/point/last-week';

/**
 * Fetches weekly download counts for a single npm package.
 * 
 * Design decision: We fetch packages sequentially rather than in parallel.
 * Parallel fetching is faster but harder to reason about when one fails.
 * For a weekly automation job, a few extra seconds doesn't matter.
 * Reliability and predictable error reporting matters more.
 */
async function fetchPackageDownloads(
  packageName: string
): Promise<NpmPackageDownloads> {
  // npm scoped packages (like @hyperjump/json-schema) need URL encoding
  const encodedName = encodeURIComponent(packageName);
  const url = `${NPM_API_BASE}/${encodedName}`;

  console.log(`  Fetching npm downloads for: ${packageName}`);

  const response = await fetch(url);

  // Fail loudly — we never swallow errors silently.
  // If a package fetch fails, we want to know immediately.
  if (!response.ok) {
    throw new Error(
      `npm API request failed for "${packageName}": ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as {
    downloads: number;
    start: string;
    end: string;
    package: string;
  };

  return {
    package: data.package,
    downloads: data.downloads,
    start: data.start,
    end: data.end,
  };
}

/**
 * Collects download stats for all tracked packages and returns
 * a complete, timestamped npm snapshot.
 * 
 * Called from the main orchestrator (src/index.ts)
 */
export async function collectNpmMetrics(): Promise<NpmSnapshot> {
  console.log('\n Collecting npm download metrics...');

  const now = new Date();
  const packages: NpmPackageDownloads[] = [];

  for (const packageName of TRACKED_PACKAGES) {
    const result = await fetchPackageDownloads(packageName);
    packages.push(result);
  }

  console.log(`  ✓ Collected data for ${packages.length} packages`);

  return {
    collectedAt: now.toISOString(),
    collectedAtUnix: now.getTime(),
    packages,
  };
}