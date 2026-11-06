import { db } from '../db/client.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { PLUGINS, pluginById } from './aggregators/index.js';

/**
 * Aggregator credentials. An admin saves them on the Integrations page (stored encrypted in aggregator_credentials); until something is saved,
 * the server environment (LORRIGO_API_KEY, ...) is used, so existing deployments keep working.
 * Booking code asks for an adapter synchronously, so the saved values are kept in a small in-memory cache that is loaded at start-up, replaced
 * right after a save, and refreshed every 30 seconds (that is how the worker process notices a key changed by the API process).
 */
type Saved = { credentials: Record<string, string>; enabled: boolean };
const cache = new Map<string, Saved>();

export async function loadSavedCredentials(): Promise<void> {
  const rows = await db.query<{ aggregator: string; encrypted_credentials: Buffer; key_reference: string; enabled: boolean }>('SELECT aggregator, encrypted_credentials, key_reference, enabled FROM aggregator_credentials');
  const next = new Map<string, Saved>();
  for (const row of rows.rows) {
    try { next.set(row.aggregator, { credentials: JSON.parse(decryptSecret(row.encrypted_credentials, row.key_reference)), enabled: row.enabled }); }
    catch { /* an unreadable row (key changed) is ignored: the environment fallback is used and the Integrations page shows it as not saved */ }
  }
  cache.clear();
  for (const [k, v] of next) cache.set(k, v);
}

export function startCredentialRefresh(log: { error: (o: unknown, m?: string) => void }) {
  void loadSavedCredentials().catch((e) => log.error(e, 'Could not load aggregator credentials'));
  const timer = setInterval(() => { void loadSavedCredentials().catch((e) => log.error(e, 'Could not refresh aggregator credentials')); }, 30_000);
  return () => clearInterval(timer);
}

/** Saved values win; any field not saved falls back to the environment. A disabled integration has no credentials at all. */
export function credentialsFor(aggregator: string): Record<string, string> {
  const plugin = pluginById(aggregator);
  if (!plugin) return {};
  const saved = cache.get(aggregator);
  if (saved && !saved.enabled) return {};
  return { ...plugin.envCredentials(), ...Object.fromEntries(Object.entries(saved?.credentials ?? {}).filter(([, v]) => v !== '')) };
}

export async function saveCredentials(aggregator: string, values: Record<string, string>, userId: string): Promise<void> {
  const plugin = pluginById(aggregator); if (!plugin) throw Object.assign(new Error('Unknown aggregator'), { statusCode: 404 });
  const allowed = new Set(plugin.credentialFields.map((f) => f.key));
  const current = cache.get(aggregator)?.credentials ?? {};
  // A blank field keeps the value already saved (the page never shows secrets back, so it cannot resend them).
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(values)) if (allowed.has(k) && typeof v === 'string' && v.trim() !== '') merged[k] = v.trim();
  const { ciphertext, keyReference } = encryptSecret(JSON.stringify(merged));
  await db.query(
    `INSERT INTO aggregator_credentials (aggregator, encrypted_credentials, key_reference, enabled, updated_by, updated_at) VALUES ($1, $2, $3, true, $4, now())
     ON CONFLICT (aggregator) DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials, key_reference = EXCLUDED.key_reference, enabled = true, updated_by = EXCLUDED.updated_by, updated_at = now(), last_tested_at = NULL, last_test_ok = NULL, last_test_message = NULL`,
    [aggregator, ciphertext, keyReference, userId]);
  cache.set(aggregator, { credentials: merged, enabled: true });
}

/** What is configured for each aggregator, without ever returning a secret: which fields have a value, and where it comes from. */
export function describeCredentials(aggregator: string) {
  const plugin = pluginById(aggregator)!;
  const saved = cache.get(aggregator);
  const env = plugin.envCredentials();
  return plugin.credentialFields.map((f) => ({
    key: f.key, label: f.label, secret: f.secret, required: f.required, hint: f.hint ?? null,
    source: saved?.credentials[f.key] ? 'saved' : env[f.key] ? 'environment' : 'missing',
    // Only non-secret values are shown back (for example the base URL).
    value: !f.secret ? (saved?.credentials[f.key] ?? env[f.key] ?? '') : undefined,
  }));
}

export const isConfigured = (aggregator: string) => {
  const plugin = pluginById(aggregator); if (!plugin) return false;
  const creds = credentialsFor(aggregator);
  return plugin.credentialFields.filter((f) => f.required).every((f) => !!creds[f.key]);
};
export const allPlugins = () => PLUGINS;
