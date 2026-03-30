/**
 * writer.ts — Handles all data persistence for the pipeline
 * 
 * Design decisions documented:
 * 
 * 1. JSON over CSV
 *    The existing proof-of-concept uses CSV. We use JSON because:
 *    - JSON is self-describing (field names travel with the data)
 *    - Nested structures are natural (CSV can't represent them cleanly)
 *    - JSON is directly consumable by visualization libraries
 *    - Adding new fields doesn't break existing consumers
 * 
 * 2. Two storage layers
 *    - Full snapshots: data/snapshots/YYYY-MM-DD.json
 *      Complete data for each run. Use these when you need everything.
 *    - History file: data/history.json
 *      Lightweight append-only log of key metrics over time.
 *      Use this for trend charts — fast to read, small in size.
 * 
 * 3. Self-initializing directories
 *    The existing code assumes data/ exists and crashes if it doesn't.
 *    We create directories automatically before writing.
 */

import fs from 'fs';
import path from 'path';
import { EcosystemSnapshot, HistoryFile, HistoryEntry } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

/**
 * Ensures all required directories exist before we try to write.
 * Creates them recursively if they don't.
 * 
 * This fixes a specific bug in the existing code where data/ was
 * assumed to exist and the script would crash silently without it.
 */
function ensureDirectories(): void {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    console.log('  Created data/snapshots/ directory');
  }
}

/**
 * Writes a complete snapshot to data/snapshots/{date}.json
 */
function writeSnapshot(snapshot: EcosystemSnapshot): void {
  const date = snapshot.collectedAt.split('T')[0]; // YYYY-MM-DD
  const filePath = path.join(SNAPSHOTS_DIR, `${date}.json`);

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(`  ✓ Snapshot written: data/snapshots/${date}.json`);
}

/**
 * Appends a summary entry to data/history.json
 * 
 * If history.json doesn't exist yet, creates it fresh.
 * If it exists, reads it and appends the new entry.
 * 
 * This is the longitudinal tracking mechanism — every run adds
 * one row to history, building up a time series over months/years.
 */
function appendToHistory(snapshot: EcosystemSnapshot): void {
  let history: HistoryFile;

  if (fs.existsSync(HISTORY_FILE)) {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    history = JSON.parse(raw) as HistoryFile;
  } else {
    // First run — initialize history file
    history = {
      lastUpdated: snapshot.collectedAt,
      totalRuns: 0,
      entries: [],
    };
  }

  // Extract the key summary metrics for the history log
  const ajvData = snapshot.npm.packages.find(p => p.package === 'ajv');
  const githubData = snapshot.github.repos.find(r => r.topic === 'json-schema');
  
  // Track stars on the spec repo as a longitudinal interest signal
  const specRepo = snapshot.orgHealth.repositories.find(
    r => r.repo === 'json-schema-spec'
  );

  const entry: HistoryEntry = {
    runId: snapshot.runId,
    collectedAt: snapshot.collectedAt,
    ajvWeeklyDownloads: ajvData?.downloads ?? 0,
    jsonSchemaRepoCount: githubData?.totalCount ?? 0,
    jsonSchemaSpecStars: specRepo?.stars ?? 0,
  };

  history.entries.push(entry);
  history.totalRuns = history.entries.length;
  history.lastUpdated = snapshot.collectedAt;

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  console.log(`  ✓ History updated: ${history.totalRuns} total runs recorded`);
}

/**
 * Main storage function — called by the orchestrator.
 * Writes both the full snapshot and the history entry.
 */
export function saveSnapshot(snapshot: EcosystemSnapshot): void {
  console.log('\n Saving data...');
  ensureDirectories();
  writeSnapshot(snapshot);
  appendToHistory(snapshot);
}