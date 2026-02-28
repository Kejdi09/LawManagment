
import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocation, useNavigate } from 'react-router-dom';
const API_URL = import.meta.env.VITE_API_URL ?? '';


export default function Login({ onLogin }: { onLogin?: () => void }) {
  const [mediaMode, setMediaMode] = useState<'video' | 'gif' | 'fallback'>('video');
  const [authState, setAuthState] = useState<'idle' | 'error' | 'success'>('idle');
  const [statusMessage, setStatusMessage] = useState('Welcome to Dafku Management System');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const returnTo = from ? `${from.pathname || '/'}${from.search || ''}${from.hash || ''}` : '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAuthState('idle');
    setStatusMessage('Checking your credentials...');
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && (data as { success?: boolean }).success) {
        setAuthState('success');
        setStatusMessage('Welcome back! Logging you in...');
        const token = (data as { token?: string }).token;
        const role = (data as { role?: string }).role;
        login(token);
        setError('');
        window.setTimeout(() => {
          if (onLogin) {
            onLogin();
          } else {
            const dest = returnTo;
            navigate(dest, { replace: true });
            void refreshSession();
          }
        }, 750);
      } else {
        const message = (data as { message?: string }).message || (res.status >= 500 ? 'Server is unavailable. Please try again shortly.' : 'Invalid credentials');
        setError(message);
        setAuthState('error');
        setStatusMessage("You can't enter. Credentials are incorrect.");
      }
    } catch {
      setError('Could not reach server. Check backend URL/deployment and try again.');
      setAuthState('error');
      setStatusMessage("You can't enter right now. Server is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground px-4">
      <form onSubmit={handleSubmit} className={`bg-card text-card-foreground p-8 rounded-lg border border-border shadow-md w-full max-w-sm ${authState === 'error' ? 'law-shake' : ''}`}>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className={`relative w-full overflow-hidden rounded-xl border border-border bg-secondary/40 ${authState === 'success' ? 'law-success-glow' : ''}`}>
            {mediaMode === 'video' && (
              <video
                className="h-40 w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                onError={() => setMediaMode('gif')}
                poster="/placeholder.svg"
              >
                <source src="/law-animal.webm" type="video/webm" />
                <source src="/law-animal.mp4" type="video/mp4" />
              </video>
            )}
            {mediaMode === 'gif' && (
              <img
                src="/law-animal.gif"
                alt="Animated law mascot"
                className="h-40 w-full object-cover"
                onError={() => setMediaMode('fallback')}
              />
            )}
            {mediaMode === 'fallback' && (
              <div className="h-40 w-full flex items-center justify-center bg-gradient-to-br from-muted to-accent text-sm text-muted-foreground px-4 text-center">
                Add a real mascot animation file: /public/law-animal.gif, /public/law-animal.mp4, or /public/law-animal.webm
              </div>
            )}
            <div className={`absolute bottom-2 left-2 right-2 rounded-md bg-background/75 px-2 py-1 text-xs ${authState === 'success' ? 'law-fade-in' : ''}`}>
              {statusMessage}
            </div>
          </div>
          <img src="/download.jpg" alt="Dafku" className="h-12 w-12 rounded-md object-cover border border-border" />
          <h2 className="text-xl font-bold">Dafku Management System</h2>
          <div className="text-xs text-muted-foreground">Dafku Law Firm</div>
        </div>
        <input
          className="w-full p-2 mb-4 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground"
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input
          className="w-full p-2 mb-4 rounded border border-input bg-background text-foreground placeholder:text-muted-foreground"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <div className="text-destructive mb-4 text-sm">{error}</div>}
        <button
          className="w-full bg-primary text-primary-foreground py-2 rounded hover:opacity-90 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : authState === 'success' ? 'Welcome back!' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
