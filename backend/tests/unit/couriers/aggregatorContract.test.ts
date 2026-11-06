import { describe, expect, it } from 'vitest';
import { PLUGINS } from '../../../src/couriers/aggregators/index.js';

// The contract every aggregator plugin must satisfy. A new plugin is covered automatically as soon as it is listed in couriers/aggregators/index.ts.
describe.each(PLUGINS.map((p) => [p.id, p] as const))('aggregator plugin "%s"', (_id, plugin) => {
  it('has a stable id, a label and credential fields', () => {
    expect(plugin.id).toMatch(/^[a-z0-9-]{2,40}$/);
    expect(plugin.label.trim().length).toBeGreaterThan(1);
    const keys = plugin.credentialFields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => /^[A-Za-z][A-Za-z0-9]*$/.test(k))).toBe(true);
  });

  it('marks key / token fields as secret so they are never shown back', () => {
    for (const f of plugin.credentialFields) if (/key|token|secret|password/i.test(f.key)) expect(f.secret).toBe(true);
  });

  it('reads its environment without throwing and returns only strings', () => {
    const env = plugin.envCredentials();
    for (const v of Object.values(env)) expect(typeof v).toBe('string');
  });

  it('refuses to build an adapter without credentials (never silently fakes bookings)', () => {
    const required = plugin.credentialFields.filter((f) => f.required);
    if (!required.length) return;
    try { plugin.create({}); throw new Error('create() accepted empty credentials'); }
    catch (e) { expect((e as { statusCode?: number }).statusCode).toBe(503); }
  });

  it('builds an adapter that can book and cancel when credentials are present', () => {
    const creds = Object.fromEntries(plugin.credentialFields.map((f) => [f.key, f.key === 'baseUrl' ? 'https://example.test' : 'x-test-value']));
    const adapter = plugin.create(creds);
    expect(typeof adapter.book).toBe('function');
    expect(typeof adapter.cancel).toBe('function');
    if (plugin.capabilities.listServices) expect(typeof adapter.listServices).toBe('function');
    if (plugin.capabilities.ndrAction) expect(typeof adapter.ndrAction).toBe('function');
  });

  it('webhook: not configured without credentials, rejects a request with no or a wrong token, parses garbage to nothing', () => {
    if (!plugin.webhook) return;
    expect(plugin.webhook.configured({})).toBe(false);
    expect(plugin.webhook.verify({}, {}, '')).toBe(false);
    expect(plugin.webhook.verify({ 'x-api-key': 'wrong' }, { webhookToken: 'right-token-value' }, '')).toBe(false);
    for (const garbage of [null, undefined, 42, 'text', [], {}, { data: [] }, [null, 1, 'x']]) expect(plugin.webhook.parse(garbage)).toEqual([]);
  });

  it('capabilities that need code are backed by code', () => {
    if (plugin.capabilities.track) expect(typeof plugin.poll).toBe('function');
    if (plugin.webhook) expect(typeof plugin.webhook.parse).toBe('function');
  });
});
