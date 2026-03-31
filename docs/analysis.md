# Metric Analysis

> Written answers for Part 1 of the GSoC 2026 qualification task for
> [Ecosystem Observability #980](https://github.com/json-schema-org/community/issues/980).

---

## Metric 1: npm Weekly Downloads

**What it tells us about the ecosystem**

Weekly download counts for JSON Schema validators are the most direct
signal of developer adoption available without instrumentation. When
a developer installs AJV in a new project, runs CI, or builds a Docker
image, that registers as a download. Tracking this over time answers:

- Is the ecosystem growing or contracting?
- Are developers consolidating around specific validators (AJV dominates
  at ~268M downloads/week vs jsonschema at ~5.8M)?
- Do major releases or breaking changes cause visible adoption shifts?

The gap between AJV (~268M) and the next validator (~77M for ajv-formats,
which is an AJV plugin) confirms AJV's dominant position and also shows
that the ecosystem has a long tail of lower-adoption validators worth
monitoring for growth signals.

**How I would automate this to run weekly**

The GitHub Actions workflow at [`.github/workflows/collect.yml`](../.github/workflows/collect.yml) already
implements this. It triggers every Sunday at midnight UTC via a cron
schedule (`0 0 * * 0`), runs `npm run collect`, and commits the results
back to the repository. The npm API requires no authentication and has
generous rate limits, making it well-suited for automated collection.

**One challenge faced and its solution**

npm scoped packages like `@hyperjump/json-schema` use an `@org/package`
naming convention that breaks URL construction if used directly in a
path. The fix is URL encoding the package name before inserting it into
the API URL:
```typescript
const encodedName = encodeURIComponent(packageName);
const url = `${NPM_API_BASE}/${encodedName}`;
```

Without this, the `/` in scoped package names creates an invalid URL
path. This is a small but real production concern — it would silently
fail or return wrong data without proper encoding.

---

## Metric 2: GitHub Repository Count

**What it tells us about the ecosystem**

The number of public GitHub repositories tagged with the `json-schema`
topic measures ecosystem breadth — how many projects explicitly identify
themselves as JSON Schema users. This is distinct from adoption (npm
downloads measure how often validators run; repo counts measure how
many distinct projects use them).

Growth in this metric signals that JSON Schema is spreading to new
projects and domains, not just running more frequently in existing ones.
At 2,514 repos as of March 2026, with 3 new repos added in a single day,
the ecosystem is actively growing.

An important nuance: `isApproximate` is stored alongside the count.
GitHub's search API sets `incomplete_results: true` when the count is
an estimate rather than exact. We surface this flag rather than hiding
it, so consumers of the data know when to treat numbers as trends rather
than exact figures.

**How I would automate this to run weekly**

Same GitHub Actions workflow. The GitHub Search API requires
authentication for higher rate limits (5,000 requests/hour
authenticated vs 60/hour unauthenticated). The `GITHUB_TOKEN`
provided automatically by GitHub Actions handles this.

**One challenge faced and its solution**

GitHub's search API returns approximate counts for large result sets.
Initially I was going to store only the `total_count` field. After
reading the API documentation more carefully, I noticed the
`incomplete_results` boolean which signals when counts are approximate.

Storing this flag transforms a potential data quality problem into
documented metadata. Someone analyzing the data months later will know
whether a sudden jump in repo count reflects real growth or a change
in GitHub's counting methodology.

---

## Metric 3: Organization Repository Health

**What it tells us about the ecosystem**

Where npm downloads measure adoption and GitHub topic counts measure
ecosystem breadth, org repository health measures the vitality of the
JSON Schema organization itself. Tracking stars, forks, open issues,
and last push date for the four key repositories answers:

- Is interest in the specification growing (stars on json-schema-spec)?
- Are people actively contributing (fork counts)?
- Is the backlog growing faster than it's being resolved (open issues)?
- Are repos being actively maintained (last push date)?

Current observations from the first collection run:
- `json-schema-spec`: 4,914 stars, 416 forks, 65 open issues — healthy
  ratio of engagement to backlog
- `website`: 153 stars but 449 forks and 329 open issues — high
  contributor activity, substantial backlog worth monitoring
- `JSON-Schema-Test-Suite`: last pushed March 30 2026 (the day of
  collection) — actively maintained
- `community`: last pushed February 2026 — slower cadence, consistent
  with its role as a discussion space rather than active code

**How I would automate this to run weekly**

Same GitHub Actions workflow. All four repos are fetched using the
individual repo endpoint (`/repos/{owner}/{repo}`) rather than the org
repos list, which gives exact data for the repos we care about without
paginating through all 23 org repositories.

---

## On Bowtie Compliance Scores

Bowtie compliance scores were planned as a fourth metric. After
investigation, Bowtie has no public REST API. The investigation process,
findings, and the correct architectural path forward are documented in:

- [`src/collectors/bowtie.ts`](../src/collectors/bowtie.ts) — preserved investigation artifact
- [`docs/decisions.md`](./decisions.md) — Decision 8

---

## Longitudinal Observations From Two Runs

Even with just two collection runs (March 29 and March 30, 2026), the
data already shows meaningful signal:

- AJV downloads: 272,281,769 → 268,086,643 — a 4.2M download decrease. This likely reflects normal weekly variance (the
  measured windows overlap by 6 of 7 days) and is worth tracking to
  distinguish normal variance from a genuine trend.

  **On the apparent download decrease between runs:**
    The npm API returns downloads for the most recently completed 7-day window, not a fixed calendar week. When the pipeline ran on consecutive days (March 29 and March 30), the measured windows overlapped by 6 of 7 days — only one day rotated out and one rotated in. 
    
    The 4.2M difference reflects the download volume of the day that left the window versus the day that entered it, not a genuine week-over-week decline. Downloads naturally vary by day of week — *weekdays are heavier than weekends as CI pipelines and build systems run on work schedules.*

    This is precisely why the GitHub Actions workflow is scheduled to run every Sunday at midnight UTC. Consistent same-day weekly collection ensures measured windows are truly non-overlapping and directly comparable over time. Daily collection would produce misleading apparent volatility from this sliding window effect. The variance observed here will disappear once the pipeline has been running weekly for several weeks — at which point the data will show genuine trends rather than measurement artifacts.
- GitHub repos: 2,511 → 2,514 — 3 new repos tagged json-schema in
  one day. At this rate the ecosystem adds ~20 repos per week.
- json-schema-spec stars: 4,914 (only one run with this metric so
  far — trend tracking begins next week).

This is the value of longitudinal collection. A single snapshot tells
you the current state. Weekly snapshots over months will tell you
whether the ecosystem is accelerating, plateauing, or declining.

---