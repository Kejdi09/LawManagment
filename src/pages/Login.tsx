
import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocation, useNavigate } from 'react-router-dom';
const API_URL = import.meta.env.VITE_API_URL ?? '';


export default function Login({ onLogin }: { onLogin?: () => void }) {
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
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-80">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        <input
          className="w-full p-2 mb-4 border rounded"
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input
          className="w-full p-2 mb-4 border rounded"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <div className="text-red-500 mb-4">{error}</div>}
        <button
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}
