/**
 * orgHealth.ts — Collector for JSON Schema org repository health metrics
 * 
 * WHY THIS METRIC?
 * The original ecosystem metrics proposal (issue #518) explicitly listed
 * stars, forks, contributors, and open issues as key signals. This collector
 * directly implements that vision for the repositories that matter most to
 * the JSON Schema organization.
 * 
 * Tracking these metrics longitudinally answers questions like:
 * - Is the JSON Schema specification gaining community interest over time?
 * - Are open issues growing faster than they're being closed?
 * - Is the test suite being actively maintained?
 * - Which repos show signs of declining activity?
 * 
 * API used: GitHub REST API — repos endpoint
 * https://api.github.com/repos/{owner}/{repo}
 * Same authentication as the github.ts collector.
 */

import { OrgHealthSnapshot, RepoHealthMetrics } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * The repositories we track.
 * 
 * Selection criteria:
 * - Core to the JSON Schema organization's mission
 * - Actively maintained (not archived experiments)
 * - Representative of different aspects: spec, docs, tooling, testing
 * 
 * This list is designed to be extended — adding a repo here
 * is all that's needed to start tracking it.
 */
const TRACKED_REPOS = [
  { owner: 'json-schema-org', repo: 'json-schema-spec' },
  { owner: 'json-schema-org', repo: 'website' },
  { owner: 'json-schema-org', repo: 'community' },
  { owner: 'json-schema-org', repo: 'JSON-Schema-Test-Suite' },
] as const;

/**
 * The shape of the GitHub repo API response.
 * We only type the fields we actually use — not the entire
 * response object which has 80+ fields.
 */
interface GitHubRepoResponse {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;   // GitHub includes PRs in this count
  watchers_count: number;
  archived: boolean;
  default_branch: string;
  pushed_at: string;           // ISO timestamp of last push
}

/**
 * Fetches health metrics for a single repository.
 * 
 * Design note: We use the individual repo endpoint rather than
 * the org repos list endpoint. This gives us exact data for
 * repos we care about rather than paginating through all org repos.
 */
async function fetchRepoHealth(
  owner: string,
  repo: string,
  token: string
): Promise<RepoHealthMetrics> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;

  console.log(`  Fetching health metrics for: ${owner}/${repo}`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'json-schema-observability-poc',
      'X-GitHub-Api-Version': '2026-03-10',
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    // Fail loudly — if a core org repo can't be fetched, that's
    // a problem worth knowing about immediately
    throw new Error(
      `GitHub API request failed for "${owner}/${repo}": ` +
      `${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as GitHubRepoResponse;

  return {
    owner,
    repo,
    fullName: data.full_name,
    // Some repos have null descriptions — default to empty string
    description: data.description ?? '',
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    watchers: data.watchers_count,
    isArchived: data.archived,
    defaultBranch: data.default_branch,
    lastPushedAt: data.pushed_at,
  };
}

/**
 * Collects health metrics for all tracked repositories.
 * Returns a complete, timestamped org health snapshot.
 * 
 * Called from the main orchestrator (src/index.ts)
 */
export async function collectOrgHealthMetrics(
  token: string
): Promise<OrgHealthSnapshot> {
  console.log('\n Collecting JSON Schema org repository health metrics...');

  const now = new Date();
  const repositories: RepoHealthMetrics[] = [];

  // Sequential fetching — predictable, easy to debug, rate-limit friendly
  for (const { owner, repo } of TRACKED_REPOS) {
    const metrics = await fetchRepoHealth(owner, repo, token);
    repositories.push(metrics);

    // Log a useful summary line for each repo as we go
    console.log(
      `  ✓ ${metrics.fullName} — ` +
      `⭐ ${metrics.stars.toLocaleString()} stars, ` +
      `🍴 ${metrics.forks} forks, ` +
      `📋 ${metrics.openIssues} open issues`
    );
  }

  return {
    collectedAt: now.toISOString(),
    collectedAtUnix: now.getTime(),
    organization: 'json-schema-org',
    repositories,
  };
}