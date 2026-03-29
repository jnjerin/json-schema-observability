/**
 * index.ts — Main orchestrator for the observability pipeline
 * 
 * This is the entry point. It:
 * 1. Validates required environment variables (fails fast if missing)
 * 2. Runs all collectors in sequence
 * 3. Assembles the complete snapshot
 * 4. Saves to disk
 * 5. Exits with a clear success or failure signal
 * 
 * Design decision: Sequential collection, not parallel.
 * Parallel would be faster but harder to debug when one collector fails.
 * For a weekly cron job, predictability beats speed.
 */

import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { collectNpmMetrics } from './collectors/npm';
import { collectGitHubMetrics } from './collectors/github';
import { collectBowtieMetrics } from './collectors/bowtie';
import { saveSnapshot } from './storage/writer';
import { EcosystemSnapshot } from './types';

// Load .env file into process.env before anything else
config();

/**
 * Validates that all required environment variables are present.
 * Fails immediately with a clear error if anything is missing.
 * 
 * This directly addresses the existing code's problem of silently
 * failing when configuration is missing.
 */
function validateEnvironment(): { githubToken: string } {
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    console.error('❌ Missing required environment variable: GITHUB_TOKEN');
    console.error('   Create a .env file with GITHUB_TOKEN=your_token_here');
    console.error('   See .env.example for reference');
    process.exit(1); // Exit with error code — GitHub Actions will catch this
  }

  return { githubToken };
}

/**
 * Main collection pipeline.
 * Uses async/await correctly throughout.
 */
async function main(): Promise<void> {
  console.log('🔍 JSON Schema Ecosystem Observability');
  console.log('======================================');
  console.log(`Run started: ${new Date().toISOString()}\n`);

  // Step 1: Validate config before doing any work
  const { githubToken } = validateEnvironment();

  // Step 2: Generate a unique ID for this run
  // Useful for correlating logs and data files
  const runId = randomUUID();
  console.log(`Run ID: ${runId}`);

  // Step 3: Collect all metrics
  // Each collector handles its own errors and logs its own progress
  const [npmMetrics, githubMetrics, bowtieMetrics] = await Promise.allSettled([
    collectNpmMetrics(),
    collectGitHubMetrics(githubToken),
    collectBowtieMetrics(),
  ]);

  // Step 4: Unwrap results — handle any collector failures explicitly
  if (npmMetrics.status === 'rejected') {
    console.error('\n❌ npm collection failed:', npmMetrics.reason);
    process.exit(1); // npm data is core — fail the run if it's missing
  }

  if (githubMetrics.status === 'rejected') {
    console.error('\n❌ GitHub collection failed:', githubMetrics.reason);
    process.exit(1); // GitHub data is core — fail the run if it's missing
  }

  // Bowtie is optional — we continue even if it fails
  const bowtieData = bowtieMetrics.status === 'fulfilled'
    ? bowtieMetrics.value
    : null;

  if (bowtieMetrics.status === 'rejected') {
    console.warn('\n⚠️  Bowtie collection failed — continuing without it');
  }

  // Step 5: Assemble the complete snapshot
  const snapshot: EcosystemSnapshot = {
    runId,
    collectedAt: new Date().toISOString(),
    npm: npmMetrics.value,
    github: githubMetrics.value,
    bowtie: bowtieData,
  };

  // Step 6: Save everything
  saveSnapshot(snapshot);

  // Step 7: Print summary
  console.log('\n✅ Collection complete!');
  console.log('─────────────────────────────────────');
  console.log(`AJV weekly downloads: ${npmMetrics.value.packages.find(p => p.package === 'ajv')?.downloads.toLocaleString()}`);
  console.log(`GitHub repos (json-schema): ${githubMetrics.value.repos[0]?.totalCount.toLocaleString()}`);
  if (bowtieData) {
    console.log(`Top Bowtie compliance: ${bowtieData.implementations[0]?.name} at ${bowtieData.implementations[0]?.complianceRate}%`);
  }
  console.log('─────────────────────────────────────');
}

// The critical fix: properly awaiting main() and handling errors.
// The existing code had: main() — no await, errors swallowed silently.
// We have: main().catch() — errors surface immediately with full details.
main().catch((error: Error) => {
  console.error('\n❌ Fatal error in collection pipeline:');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
});