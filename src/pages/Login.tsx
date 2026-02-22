
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocation, useNavigate } from 'react-router-dom';
const API_URL = import.meta.env.VITE_API_URL ?? '';


export default function Login({ onLogin }: { onLogin?: () => void }) {
  const mascots = ['🐶⚖️', '🐱📁', '🦉📚'];
  const [mascotIndex, setMascotIndex] = useState(0);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const returnTo = from ? `${from.pathname || '/'}${from.search || ''}${from.hash || ''}` : '/';

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMascotIndex((prev) => (prev + 1) % mascots.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, [mascots.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && (data as { success?: boolean }).success) {
        const token = (data as { token?: string }).token;
        const role = (data as { role?: string }).role;
        login(token);
        setError('');
        if (onLogin) {
          onLogin();
        } else {
          // Redirect based on role returned from login API (avoid stale context)
          const dest = role === 'intake' ? '/customers' : returnTo;
          navigate(dest, { replace: true });
          // Refresh session in background
          void refreshSession();
        }
      } else {
        const message = (data as { message?: string }).message || (res.status >= 500 ? 'Server is unavailable. Please try again shortly.' : 'Invalid credentials');
        setError(message);
      }
    } catch {
      setError('Could not reach server. Check backend URL/deployment and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground px-4">
      <form onSubmit={handleSubmit} className="bg-card text-card-foreground p-8 rounded-lg border border-border shadow-md w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="law-float law-wiggle rounded-full border border-border bg-secondary px-3 py-1 text-xl" aria-hidden="true">
            {mascots[mascotIndex]}
          </div>
          <div className="text-[11px] text-muted-foreground">Your law buddy is on duty</div>
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
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <button
          className="w-full bg-primary text-primary-foreground py-2 rounded hover:opacity-90 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
