import test from 'node:test';
import assert from 'node:assert/strict';
import { openDocuments, openDocumentsMessage, MAX_PRINT, INLINE_MAX } from '../lib/openDocs.js';

// UX-010: a blocked pop-up used to be invisible (window.open with "noopener" always returns null), and a storage failure was reported as "too many".
const ids = (n) => Array.from({ length: n }, (_, i) => `id-${i}`);
const env = (over = {}) => {
  const calls = { open: [], storage: {} };
  return { calls, env: { open: (...a) => { calls.open.push(a); return { closed: false, opener: {} }; }, setItem: (k, v) => { calls.storage[k] = v; }, now: () => 1700000000000, random: () => 'abcd', ...over } };
};

test('a small selection opens with the ids in the address', () => {
  const { env: e, calls } = env();
  const r = openDocuments('label', ids(3), e);
  assert.equal(r.status, 'opened');
  assert.equal(calls.open[0][0], '/documents/label?ids=id-0,id-1,id-2');
  assert.equal(Object.keys(calls.storage).length, 0);
});

test('the window is opened WITHOUT the noopener feature (that is what makes blocking detectable), and the opener is cut by hand', () => {
  const win = { closed: false, opener: { x: 1 } };
  const { env: e, calls } = env({ open: (...a) => { calls.open.push(a); return win; } });
  openDocuments('invoice', ids(2), e);
  assert.equal(calls.open[0].length, 2);
  assert.equal(win.opener, null);
});

test('a blocked pop-up (null window) is reported as blocked and returns the URL for a real click', () => {
  const { env: e } = env({ open: () => null });
  const r = openDocuments('label', ids(5), e);
  assert.equal(r.status, 'blocked');
  assert.equal(r.url, '/documents/label?ids=id-0,id-1,id-2,id-3,id-4');
  assert.match(openDocumentsMessage(r, 'label'), /blocked the label window/);
});

test('a window that closed straight away counts as blocked too', () => {
  const { env: e } = env({ open: () => ({ closed: true }) });
  assert.equal(openDocuments('label', ids(2), e).status, 'blocked');
});

test('window.open throwing is blocked, not a crash', () => {
  const { env: e } = env({ open: () => { throw new Error('denied'); } });
  assert.equal(openDocuments('label', ids(2), e).status, 'blocked');
});

test('boundary: exactly INLINE_MAX ids stay in the address, INLINE_MAX + 1 go through storage', () => {
  const a = env(); const r1 = openDocuments('label', ids(INLINE_MAX), a.env);
  assert.match(r1.url, /\?ids=/); assert.equal(Object.keys(a.calls.storage).length, 0);
  const b = env(); const r2 = openDocuments('label', ids(INLINE_MAX + 1), b.env);
  assert.match(r2.url, /\?batch=nx-doc-/);
  const [key, value] = Object.entries(b.calls.storage)[0];
  assert.match(r2.url, new RegExp(key));
  assert.equal(JSON.parse(value).length, INLINE_MAX + 1);
});

test('storage failing is reported as a STORAGE problem, not as "too many"', () => {
  const { env: e } = env({ setItem: () => { throw new Error('QuotaExceededError'); } });
  const r = openDocuments('label', ids(INLINE_MAX + 40), e);
  assert.equal(r.status, 'storage_failed');
  assert.match(openDocumentsMessage(r), /storage is blocked or full/);
  assert.doesNotMatch(openDocumentsMessage(r), /too (big|many)/i);
});

test('limits: nothing selected, exactly MAX_PRINT, and one more', () => {
  const { env: e } = env();
  assert.equal(openDocuments('label', [], e).status, 'empty');
  assert.equal(openDocuments('label', ids(MAX_PRINT), e).status, 'opened');
  const r = openDocuments('label', ids(MAX_PRINT + 1), e);
  assert.equal(r.status, 'too_many');
  assert.match(openDocumentsMessage(r), /5,000/);
});

test('duplicate ids are counted once', () => {
  const { env: e, calls } = env();
  const r = openDocuments('label', ['a', 'a', 'b'], e);
  assert.equal(r.count, 2);
  assert.equal(calls.open[0][0], '/documents/label?ids=a,b');
});

test('an opened window needs no message', () => {
  assert.equal(openDocumentsMessage({ status: 'opened', count: 3 }), null);
});
