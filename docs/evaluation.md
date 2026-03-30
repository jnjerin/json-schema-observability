# Evaluation of Existing Proof-of-Concept Code

> Review of `projects/initial-data/` in the
> [json-schema-org/ecosystem](https://github.com/json-schema-org/ecosystem)
> repository as part of the GSoC 2026 qualification task.

---

## What It Does

The existing code is a Node.js script (JavaScript, not TypeScript) that
collects GitHub repository metadata for repos tagged with the `json-schema`
topic. It uses the Octokit library to call the GitHub API and records the
results as timestamped CSV files.

Specifically, for each matching repository it attempts to collect:
- Repository creation date
- Date of first commit
- Date of first release
- Repository topics

The intended output is a CSV file written to a local `data/` directory.

---

## What It Does Well

**Octokit integration** — using GitHub's official SDK rather than raw
`fetch` calls is the right approach. Octokit handles authentication,
pagination, and response typing in a maintainable way. This approach
is worth keeping in any successor implementation.

**Environment-based configuration** — storing the GitHub token in a
`.env` file via `dotenv` is correct practice. Secrets should never be
hardcoded, and this pattern transfers cleanly to GitHub Actions secrets.

**Rate limit awareness** — the code shows awareness of GitHub API rate
limits, which is a real operational concern at ecosystem scale.

---

## What Prevents It From Running

I cloned the repository, installed dependencies with `pnpm install`,
created the required `data/` directory manually, added a `.env` file
with a valid GitHub token, and ran `node main.js`.

**The script exited cleanly with no output and produced no data files.**

This is the worst possible failure mode for a data pipeline: silent
success. No error message, no indication of what happened, no way to
know whether the pipeline succeeded or failed. This is a direct
consequence of the following bugs:

**Bug 1 — Missing `await` on async `main()` (main.js line 181)**
The async main function is called without `await`. Node.js fires the
async function, the unhandled promise rejects silently, and the process
exits with code 0 — appearing successful while doing nothing.

**Bug 2 — Exception swallowing (main.js line 169)**
Errors inside the main processing loop are caught and logged but
execution continues with corrupted or missing data. In a longitudinal
pipeline, silently continuing after an error is worse than crashing —
it produces incomplete data that is indistinguishable from complete data.

**Bug 3 — Silent `undefined` returns (lines 35 and 79)**
`fetchFirstCommitDate()` and `fetchFirstReleaseDate()` have code paths
that return without a value, silently returning `undefined`. These
undefined values flow into the CSV output without any error being raised.

**Bug 4 — No CSV escaping (dataRecorder.js line 18)**
Repository descriptions or names containing commas will corrupt the CSV
structure. No escaping is applied before writing.

**Bug 5 — Missing directory creation**
The script assumes `./data/` exists and crashes if it doesn't. The
directory is never created programmatically.

**Bug 6 — No TypeScript types**
The entire codebase is untyped JavaScript. There is no compile-time
safety, making the undefined return bugs invisible until runtime.

---

## Architectural Assessment

Beyond the bugs, the code has fundamental architectural limitations
that make it the wrong foundation for the full observability project:

**It is a one-off script, not a pipeline.**
There is no GitHub Actions workflow. Running it requires manual
intervention: install dependencies, create directories, provide a token,
run the script. This cannot be automated without significant rework.

**CSV is the wrong output format.**
CSV cannot represent nested data structures. As the metrics grow to
include npm downloads, compliance scores, and org health — all with
different schemas — CSV becomes unmaintainable. JSON is self-describing,
nestable, and directly consumable by visualization tools.

**No longitudinal design.**
Each run produces a new CSV file with no mechanism for querying or
visualizing trends over time. There is no history file, no append
strategy, no schema versioning.

**Only one metric source.**
The code collects only GitHub metadata. The full project requires npm
downloads, GitHub search counts, org repository health, and potentially
Bowtie compliance data — none of which are present.

---

## Recommendation: Start Fresh

I recommend starting fresh rather than extending this code.

The bugs are not superficial, they affect the core data flow. Fixing
them while simultaneously adding new metric sources, changing the output
format from CSV to JSON, adding GitHub Actions automation, and designing
a longitudinal storage schema would effectively be a rewrite. Starting
fresh with the right architecture from the beginning produces cleaner,
more maintainable code.

**What I kept from the existing approach:**
- Octokit for GitHub API access — the right tool for this job
- `dotenv` for environment configuration — correct pattern
- The concept of timestamped data collection — the right mental model

**What I built instead:**
- TypeScript with full type definitions for all data shapes
- JSON output with a two-layer storage architecture
  (full snapshots + lightweight history file)
- Three metric sources: npm downloads, GitHub search, org repo health
- A GitHub Actions workflow for weekly automated collection
- Fail-fast error handling that surfaces problems immediately
- Self-initializing directories — zero manual setup required

---

## A Note on the Bowtie Metric

I initially planned to include Bowtie compliance scores as a third
metric via a REST API call. After investigation, I discovered that
Bowtie has no public REST API — it is a CLI tool that runs
implementations inside Docker containers and publishes results as a
rendered website.

The correct integration path is via Bowtie's official GitHub Action,
which runs natively in CI and outputs structured JSON locally. I have
documented this as a planned enhancement. The original attempted
collector is preserved in `src/collectors/bowtie.ts` with full
commentary on what was tried, what failed, and the correct architectural
approach.

---

*Part of GSoC 2026 qualification task for
[Ecosystem Observability #980](https://github.com/json-schema-org/community/issues/980)*