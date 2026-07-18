import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

export function Login({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password);
      onSignedIn(result.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-page">
      <main className="login-card">
        <div className="login-logo" aria-hidden="true">
          <span style={{ background: '#c96a7b' }} />
          <span style={{ background: '#f5efdd' }} />
          <span style={{ background: '#94ab8d' }} />
          <span style={{ background: '#7d9bb8' }} />
        </div>
        <h1>Quilt Planner</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Welcome back! Sign in to see your quilts.'
            : 'Create an account to start planning quilts.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
          </label>
          {mode === 'register' && (
            <p className="hint">At least 8 characters. Pick something memorable!</p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </main>
    </div>
  );
}
