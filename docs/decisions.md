# Architectural Decisions

> This document records the significant technical decisions made while
> building this proof-of-concept, including the reasoning and tradeoffs
> considered. Written for the GSoC 2026 qualification task for
> [Ecosystem Observability #980](https://github.com/json-schema-org/community/issues/980).

---

## Decision 1: TypeScript over JavaScript

**Choice:** TypeScript with strict mode enabled.

**Why:** The existing proof-of-concept is plain JavaScript. Three of its
six bugs are directly attributable to the absence of types — silent
`undefined` returns and unvalidated API response shapes that would be
caught at compile time in TypeScript. For a pipeline that runs
unattended weekly and is trusted to produce accurate longitudinal data,
type safety is not optional.

**Tradeoff:** TypeScript adds a compilation step and requires type
definitions for dependencies. For a small project this is minor friction.
The `ts-node` setup means local development still runs in a single
command.

---

## Decision 2: JSON over CSV for output format

**Choice:** Structured JSON with typed interfaces.

**Why:** CSV cannot represent nested data structures. Our metrics have
fundamentally different schemas — npm downloads have packages arrays,
GitHub metrics have repo arrays, org health has repository objects with
multiple fields each. Forcing this into CSV would require either multiple
files per run or a flat denormalized structure that loses information.
JSON is self-describing, nestable, directly consumable by Chart.js and
other visualization tools, and extends cleanly when new metrics are added.

**Tradeoff:** JSON is more verbose than CSV for simple tabular data. For
our use case this is irrelevant — we are not optimizing for file size,
we are optimizing for correctness and extensibility.

---

## Decision 3: Two-layer storage architecture

**Choice:** Full snapshots in `data/snapshots/YYYY-MM-DD.json` plus a
lightweight history log in `data/history.json`.

**Why:** These serve different purposes. The full snapshot contains every
field from every collector — useful when you need to debug a specific
run or add a new visualization later. The history file contains only
the key summary metrics per run — useful for trend charts because it
is small, fast to read, and doesn't require parsing multiple files.

**Tradeoff:** Data duplication — summary metrics exist in both the
snapshot and the history file. This is an acceptable tradeoff because
the history file is authoritative only for its defined fields, and full
snapshots are the source of truth.

**On schema evolution:** The first history entry in this POC has a
`bowtieTopCompliance: null` field from before the schema was updated to
use `jsonSchemaSpecStars`. This is a real example of why schema
versioning matters for longitudinal data — a future enhancement would
add a `schemaVersion` field to the history file to make migrations
explicit.

---

## Decision 4: Sequential collection over parallel

**Choice:** Collectors run sequentially, not in parallel with
`Promise.all`.

**Why:** For a weekly cron job that runs unattended, predictability and
debuggability matter more than speed. Sequential execution means log
output is ordered and readable, errors are clearly attributed to the
failing collector, and GitHub API rate limits are less likely to be
hit. The total runtime difference is a few seconds at most.

**Tradeoff:** Slower execution. Acceptable given the weekly schedule.
If collection time became a problem at larger scale, parallelism could
be introduced with explicit error isolation per collector.

---

## Decision 5: Fail-fast for core metrics, nullable for optional metrics

**Choice:** npm and GitHub & org health collectors cause the pipeline to exit with
code 1 on failure. These collectors are treated as
non-nullable core data.


**Why:** These metrics are the reason the pipeline exists. If they fail,
the run should fail loudly so GitHub Actions marks the workflow as
failed and the repository owner is notified. Silent data loss in a
longitudinal pipeline is worse than a visible failure.

**Original Bowtie design:** Bowtie was initially designed as nullable —
if unavailable, the pipeline would continue without it. This reflected
uncertainty about API availability. Now that org health uses the same
GitHub API as the other collectors, it is treated as core.

---

## Decision 6: GitHub Actions with GITHUB_TOKEN over PAT

**Choice:** Use the built-in `GITHUB_TOKEN` provided by GitHub Actions
rather than a personal access token.

**Why:** `GITHUB_TOKEN` is automatically provisioned for each workflow
run, scoped only to the repository, and expires when the job completes.
A PAT is long-lived, has broader permissions, and requires manual
rotation. For a public repository running automated commits,
`GITHUB_TOKEN` is the more secure and operationally simpler choice.

**Tradeoff:** `GITHUB_TOKEN` cannot access resources outside the
repository. If future metrics require cross-repository access with
elevated permissions, a PAT stored as a repository secret would be
needed.

---

## Decision 7: Node.js 24 in GitHub Actions

**Choice:** Pin to Node.js 24 in the workflow.

**Why:** Node.js 20 was initially used but generated a deprecation
warning indicating it would be removed from GitHub Actions runners in
September 2026. Updating to 24 (current LTS) during development rather
than waiting eliminates this warning and ensures the pipeline does not
break mid-GSoC project.

---

## Decision 8: Bowtie replacement with org health metrics

**Choice:** Replace the planned Bowtie compliance collector with GitHub
org repository health metrics.

**Why:** After investigation, Bowtie has no public REST API. The correct
integration path requires running Bowtie's GitHub Action in CI, which
is a meaningful addition beyond the scope of a qualification task POC.
Rather than shipping a broken or fake collector, I replaced it with
org health metrics — stars, forks, open issues, and last push date for
four key JSON Schema organization repositories.

**Why org health is a good replacement:** The original ecosystem metrics
proposal (issue #518) explicitly listed stars, contributors, forks, and
open issues as desired metrics. Org health metrics directly implement
that vision. They also provide a different signal than the other two
collectors — where npm downloads measure adoption and GitHub topic counts
measure ecosystem breadth, org health measures the vitality of the
organization itself.

**Bowtie path forward:** The correct implementation is documented in
`src/collectors/bowtie.ts` with full commentary. It is preserved as an
investigation artifact rather than deleted.

---
