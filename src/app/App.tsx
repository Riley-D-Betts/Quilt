import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { QuiltSummary } from '../shared/quilt';
import { Login } from './components/Login';
import { QuiltList } from './components/QuiltList';
import { Editor } from './components/Editor';

type View =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'list' }
  | { kind: 'editor'; quilt: QuiltSummary };

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setEmail(me.email);
        setView({ kind: 'list' });
      })
      .catch(() => setView({ kind: 'login' }));
  }, []);

  const handleSignedIn = useCallback((userEmail: string) => {
    setEmail(userEmail);
    setView({ kind: 'list' });
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even if the request fails, drop to the login screen.
    }
    setEmail(null);
    setView({ kind: 'login' });
  }, []);

  const handleAuthLost = useCallback(() => {
    setEmail(null);
    setView({ kind: 'login' });
  }, []);

  if (view.kind === 'loading') {
    return (
      <div className="centered-page">
        <p className="muted">Warming up…</p>
      </div>
    );
  }

  if (view.kind === 'login') {
    return <Login onSignedIn={handleSignedIn} />;
  }

  if (view.kind === 'editor') {
    return (
      <Editor
        key={view.quilt.id}
        initialQuilt={view.quilt}
        onBack={() => setView({ kind: 'list' })}
      />
    );
  }

  return (
    <QuiltList
      email={email ?? ''}
      onOpen={(quilt) => setView({ kind: 'editor', quilt })}
      onSignOut={handleSignOut}
      onError={(err) => {
        if (err instanceof ApiError && err.status === 401) handleAuthLost();
      }}
    />
  );
}
