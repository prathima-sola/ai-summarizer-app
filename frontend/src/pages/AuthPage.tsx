import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { SetupRequired } from './SetupRequired';

export function AuthPage() {
  const { configured, loading, session, signIn, signUp, requestPasswordReset } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!configured) return <SetupRequired />;
  if (!loading && session) {
    const destination = (location.state as { from?: string } | null)?.from || '/app';
    return <Navigate to={destination} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else if (mode === 'signup') {
        const result = await signUp({ email: email.trim(), password, fullName: fullName.trim() });
        if (result === 'verification-required') {
          setNotice('Check your email to verify the account, then return here to sign in.');
        }
      } else {
        await requestPasswordReset(email.trim());
        setNotice('Check your email for a secure password reset link.');
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/">Briefly</Link>
        <span className="step-label">Private document workspace</span>
        <h1 id="auth-title">{mode === 'signin' ? 'Return to your reading workspace' : mode === 'signup' ? 'Create your reading workspace' : 'Reset your workspace password'}</h1>
        <p>{mode === 'signin' ? 'Open saved documents, briefs, and questions.' : mode === 'signup' ? 'Save documents, trace claims to pages, and continue your research later.' : 'Enter your account email. Briefly will send a secure reset link.'}</p>

        {mode !== 'forgot' && <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>Create account</button>
        </div>}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required maxLength={120} />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          {mode !== 'forgot' && <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required />
          </label>}

          {error && <p className="form-message error" role="alert">{error}</p>}
          {notice && <p className="form-message success" role="status">{notice}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? 'Checking your account' : mode === 'signin' ? 'Open my workspace' : mode === 'signup' ? 'Create my workspace' : 'Send password reset link'}
          </button>
          {mode === 'signin' && <button className="auth-text-button" type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}>Reset my password</button>}
          {mode === 'forgot' && <button className="auth-text-button" type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }}>Return to sign in</button>}
        </form>

        <p className="auth-footnote">Your files remain private to your account. You can delete them from the workspace.</p>
      </section>
    </main>
  );
}
