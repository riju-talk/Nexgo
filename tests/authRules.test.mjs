import test from 'node:test';
import assert from 'node:assert/strict';
import { signupProblem } from '../lib/authRules.js';

const valid = { fullName: 'Asha Rao', email: 'asha@shop.in', password: 'a-long-password-1', confirmPassword: 'a-long-password-1' };

test('a complete form has no problem and needs no business name', () => {
  assert.equal(signupProblem(valid), '');
});

test('each rule reports its own message, in order', () => {
  assert.equal(signupProblem({ ...valid, fullName: ' A ' }), 'Enter your name.');
  assert.equal(signupProblem({ ...valid, email: 'not-an-email' }), 'Enter a valid work email.');
  assert.equal(signupProblem({ ...valid, password: 'short', confirmPassword: 'short' }), 'Password must be at least 12 characters.');
  assert.equal(signupProblem({ ...valid, confirmPassword: 'different-password' }), 'Passwords do not match.');
});
