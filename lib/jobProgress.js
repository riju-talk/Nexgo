import { useSyncExternalStore } from 'react';

// Progress of the long background jobs the seller starts (assigning couriers, cancelling). The helpers that talk to the API (lib/assignBatches.js,
// lib/cancelBatches.js) publish here; components/JobProgressHost.jsx draws one card per job on every page, so the seller always sees that work
// is going on, how far it is and how it ended, wherever they navigate.
const EMPTY = [];
let jobs = EMPTY;
let seq = 0;
const subscribers = new Set();
const emit = () => { jobs = [...jobs]; subscribers.forEach((f) => f()); };
const patchJob = (id, patch) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)); subscribers.forEach((f) => f()); };

/** Starts tracking a job; returns its id. kind = 'assign' | 'cancel'. */
export function startJob(kind, total) {
  const id = ++seq;
  const now = Date.now();
  jobs = [...jobs, { id, kind, total, done: 0, ok: 0, failed: 0, startedAt: now, changedAt: now, phase: 'running', modal: false, extra: {}, error: '', firstError: '' }];
  subscribers.forEach((f) => f());
  return id;
}

/** { done, ok, failed, total?, extra? } after every poll. `changedAt` moves only when the numbers move (the card says "still working" when it does not). */
export function updateJob(id, patch) {
  const j = jobs.find((x) => x.id === id); if (!j) return;
  const moved = (patch.done ?? j.done) !== j.done || (patch.ok ?? j.ok) !== j.ok || (patch.failed ?? j.failed) !== j.failed;
  patchJob(id, { ...patch, changedAt: moved ? Date.now() : j.changedAt });
}

/** The job ended: { ok, failed, firstError? , error? } (error = it could not even run). */
export function finishJob(id, patch = {}) {
  const j = jobs.find((x) => x.id === id); if (!j) return;
  patchJob(id, { ...patch, done: j.total, phase: patch.error ? 'error' : 'done', finishedAt: Date.now() });
}

export function dismissJob(id) { jobs = jobs.filter((j) => j.id !== id); subscribers.forEach((f) => f()); }

/** A page that already shows its own dialog for this kind of job says so, and the card stays out of the way until the dialog is closed or hidden. */
export function setJobModal(kind, open) {
  if (!jobs.some((j) => j.kind === kind && j.modal !== open)) return;
  jobs = jobs.map((j) => (j.kind === kind ? { ...j, modal: open } : j));
  emit();
}

export function useJobs() {
  return useSyncExternalStore((fn) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; }, () => jobs, () => EMPTY);
}
