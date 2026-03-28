/**
 * github.ts — Collector for GitHub ecosystem metrics
 * 
 * Why GitHub repo counts?
 * The number of public repositories using the json-schema topic is a
 * proxy for ecosystem adoption beyond just validator downloads. It captures
 * projects that USE JSON Schema (not just implement it), giving us a
 * broader picture of real-world usage.
 * 
 * API used: GitHub Search API
 * https://api.github.com/search/repositories?q=topic:json-schema
 * 
 * To Note: Known limitation (documented, not hidden):
 * GitHub returns approximate counts for large result sets. We store
 * an isApproximate flag so consumers of this data know to treat it
 * as a trend indicator, not an exact count.
 * 
 * Rate limits: 30 requests/minute unauthenticated, 30/minute authenticated
 * for search. We make 1 request per metric — well within limits.
 */

import { GitHubSnapshot, GitHubRepoMetrics } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

// Topics to track. Starting with the primary one.
// Designed to be extensible — add topics here to track more.
const TRACKED_TOPICS = ['json-schema'] as const;

/**
 * Fetches repository count for a single GitHub topic.
 */
async function fetchTopicRepoCount(
  topic: string,
  token: string
): Promise<GitHubRepoMetrics> {
  const url = `${GITHUB_API_BASE}/search/repositories?q=topic:${topic}&per_page=1`;

  console.log(`Fetching GitHub repos for topic: ${topic}`);

  const response = await fetch(url, {
    headers: {
      // Authentication increases rate limit and improves result accuracy
      Authorization: `Bearer ${token}`,
      // Required by GitHub API — identifies our application
      'User-Agent': 'json-schema-observability-poc',
      // Request the specific API version we're building against
      'X-GitHub-Api-Version': '2026-03-10',
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API request failed for topic "${topic}": ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json() as {
    total_count: number;
    incomplete_results: boolean;
  };

  return {
    topic,
    totalCount: data.total_count,
    // GitHub sets incomplete_results=true when the count is approximate
    isApproximate: data.incomplete_results,
  };
}

/**
 * Collects GitHub metrics for all tracked topics.
 * Returns a complete, timestamped GitHub snapshot.
 */
export async function collectGitHubMetrics(token: string): Promise<GitHubSnapshot> {
  console.log('\n🐙 Collecting GitHub ecosystem metrics...');

  const now = new Date();
  const repos: GitHubRepoMetrics[] = [];

  for (const topic of TRACKED_TOPICS) {
    const result = await fetchTopicRepoCount(topic, token);
    repos.push(result);
    console.log(`  ✓ Found ${result.totalCount.toLocaleString()} repos with topic: ${topic}`);
  }

  return {
    collectedAt: now.toISOString(),
    collectedAtUnix: now.getTime(),
    repos,
  };
}