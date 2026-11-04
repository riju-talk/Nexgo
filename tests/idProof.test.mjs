import test from 'node:test';
import assert from 'node:assert/strict';
import { idNumberProblem, maskedIdProof, normalizeIdNumber } from '../lib/idProof.js';

test('valid numbers pass for every accepted document', () => {
  assert.equal(idNumberProblem('aadhaar', '2345 6789 0123'), '');
  assert.equal(idNumberProblem('passport', 'a1234567'), '');
  assert.equal(idNumberProblem('voter_id', 'abc-1234567'), '');
  assert.equal(idNumberProblem('driving_licence', 'MH12 2011 0012345'), '');
});

test('wrong formats and unknown document types are reported', () => {
  assert.match(idNumberProblem('aadhaar', '1234 5678 9012'), /Aadhaar/);
  assert.match(idNumberProblem('passport', 'Q1234567'), /passport/);
  assert.equal(idNumberProblem('ration_card', '12345'), 'Choose an identity document');
});

test('normalisation and masking keep only what is safe to show', () => {
  assert.equal(normalizeIdNumber(' ab-12 '), 'AB12');
  assert.equal(maskedIdProof('passport', '4567'), 'Passport ••••4567');
  assert.equal(maskedIdProof('aadhaar', null), '—');
});
