import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Re-fetch the quilt when opening so the editor never starts from the
  // list's cached copy (which could overwrite newer edits made elsewhere).
  const openSeq = useRef(0);
  const handleOpen = useCallback(
    async (quilt: QuiltSummary) => {
      const seq = ++openSeq.current;
      try {
        const fresh = await api.getQuilt(quilt.id);
        if (openSeq.current === seq) setView({ kind: 'editor', quilt: fresh.quilt });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthLost();
        } else if (openSeq.current === seq) {
          // Offline or transient error — the cached copy is better than nothing.
          setView({ kind: 'editor', quilt });
        }
      }
    },
    [handleAuthLost],
  );

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
      onOpen={handleOpen}
      onSignOut={handleSignOut}
      onError={(err) => {
        if (err instanceof ApiError && err.status === 401) handleAuthLost();
      }}
    />
  );
}
