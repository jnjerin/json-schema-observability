/**
 * bowtie.ts — Collector for Bowtie compliance scores
 * 
 * What is Bowtie?
 * Bowtie (https://bowtie.report) is a meta-validator that runs the
 * official JSON Schema test suite against every known implementation.
 * It tells us how "correct" each implementation is — i.e., does AJV
 * actually behave the way the JSON Schema spec says it should?
 * 
 * Why does this matter for observability?
 * Download counts tell us adoption. Compliance scores tell us quality.
 * An implementation could be hugely popular but only partially correct.
 * Tracking compliance over time tells us whether the ecosystem is
 * converging toward the spec or drifting away from it.
 * 
 * API: Bowtie publishes results as JSON at a public endpoint.
 * We fetch the 2020-12 draft results as it's the current stable draft.
 */

import { BowtieSnapshot, BowtiImplementationScore } from '../types';

// Bowtie publishes a JSON summary of results per draft
// This is the public endpoint for the latest 2020-12 results
const BOWTIE_RESULTS_URL =
  'https://bowtie.report/api/v1/runs/latest?dialect=https://json-schema.org/draft/2020-12/schema';

const DRAFT = '2020-12';

/**
 * Fetches and parses Bowtie compliance results.
 * 
 * Design decision: We treat Bowtie as nullable in our snapshot type.
 * If Bowtie is unavailable, we store null rather than failing the entire
 * collection run. npm and GitHub data is more stable and shouldn't be
 * blocked by Bowtie's availability.
 */
export async function collectBowtieMetrics(): Promise<BowtieSnapshot | null> {
  console.log('\n🎯 Collecting Bowtie compliance scores...');

  try {
    const response = await fetch(BOWTIE_RESULTS_URL, {
      headers: {
        'User-Agent': 'json-schema-observability-poc',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // Non-fatal — log and return null rather than crashing
      console.warn(
        `  ⚠️  Bowtie API unavailable: ${response.status} ${response.statusText}`
      );
      console.warn('  Continuing without Bowtie data.');
      return null;
    }

    const data = await response.json() as Record<string, unknown>;

    // Parse the Bowtie response into our typed structure
    // Note: Bowtie's API shape may evolve — we parse defensively
    const implementations = parseBowtieResults(data);

    if (implementations.length === 0) {
      console.warn('  ⚠️  Bowtie returned no results. Storing null.');
      return null;
    }

    const now = new Date();
    console.log(`  ✓ Collected compliance data for ${implementations.length} implementations`);

    return {
      collectedAt: now.toISOString(),
      collectedAtUnix: now.getTime(),
      draft: DRAFT,
      implementations,
    };
  } catch (error) {
    // Network failure — non-fatal, log and continue
    console.warn('  ⚠️  Could not reach Bowtie API:', (error as Error).message);
    console.warn('  Continuing without Bowtie data.');
    return null;
  }
}

/**
 * Parses raw Bowtie API response into our typed format.
 * Kept separate so it's testable independently of the fetch call.
 */
function parseBowtieResults(data: Record<string, unknown>): BowtiImplementationScore[] {
  const implementations: BowtiImplementationScore[] = [];

  // Bowtie structures results as an object keyed by implementation name
  // We iterate and extract what we need
  if (!data || typeof data !== 'object') return [];

  const runs = data as Record<string, {
    implementation?: {
      name?: string;
      language?: string;
    };
    results?: {
      passed?: number;
      total?: number;
    };
  }>;

  for (const [key, run] of Object.entries(runs)) {
    // Skip metadata fields that aren't implementation results
    if (!run?.implementation || !run?.results) continue;

    const passed = run.results.passed ?? 0;
    const total = run.results.total ?? 0;

    implementations.push({
      name: run.implementation.name ?? key,
      language: run.implementation.language ?? 'unknown',
      draft: DRAFT,
      passedTests: passed,
      totalTests: total,
      // Round to 2 decimal places for readability
      complianceRate: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
    });
  }

  // Sort by compliance rate descending — most compliant first
  return implementations.sort((a, b) => b.complianceRate - a.complianceRate);
}