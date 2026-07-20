import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { SetupRequired } from './SetupRequired';

export function ResetPasswordPage() {
  const { configured, loading, session, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmedPassword, setConfirmedPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  if (!configured) return <SetupRequired />;
  if (loading) return <main className="route-loader"><span /><p>Checking your reset link</p></main>;
  if (complete) return <Navigate to="/app" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmedPassword) {
      setError('Enter the same password in both fields.');
      return;
    }
    if (!session) {
      setError('This reset link has expired. Request a new link.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await updatePassword(password);
      setComplete(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The password could not be updated.');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="auth-page"><section className="auth-card" aria-labelledby="reset-title">
    <Link className="auth-brand" to="/">Briefly</Link>
    <span className="step-label">Account recovery</span>
    <h1 id="reset-title">Choose a new password</h1>
    <p>Use at least eight characters and keep this password unique to Briefly.</p>
    <form onSubmit={submit}>
      <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
      <label>Confirm new password<input type="password" value={confirmedPassword} onChange={(event) => setConfirmedPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? 'Updating password' : 'Save new password'}</button>
    </form>
  </section></main>;
}
