/**
 * Client-side sign-up rules, mirrored from the API (`signupSchema`) so people see what to fix
 * before a request is sent. Business name is deliberately absent: it is collected after sign-in.
 * Returns '' when the form is valid, otherwise the first problem as a sentence.
 */
export function signupProblem(form) {
  if (form.fullName.trim().length < 2) return 'Enter your name.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid work email.';
  if (form.password.length < 12) return 'Password must be at least 12 characters.';
  if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  return '';
}
