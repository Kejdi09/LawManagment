import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (token?: string) => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AUTH_FLAG_KEY = 'auth';
const AUTH_TOKEN_KEY = 'auth_token';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem(AUTH_FLAG_KEY) === 'true');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const refreshSession = async (): Promise<boolean> => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const res = await fetch(`${API_URL}/api/me`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        setIsAuthenticated(false);
        localStorage.removeItem(AUTH_FLAG_KEY);
        return false;
      }
      const data = await res.json();
      if (data?.authenticated) {
        setIsAuthenticated(true);
        localStorage.setItem(AUTH_FLAG_KEY, 'true');
        return true;
      } else {
        setIsAuthenticated(false);
        localStorage.removeItem(AUTH_FLAG_KEY);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        return false;
      }
    } catch {
      setIsAuthenticated(false);
      localStorage.removeItem(AUTH_FLAG_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    // Check server session on mount
    refreshSession();
  }, []);

  const login = (token?: string) => {
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_FLAG_KEY, 'true');
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  };

  const logout = async () => {
    setIsAuthLoading(true);
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_FLAG_KEY);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';
      await fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore network errors; local auth already cleared
    }
    setIsAuthLoading(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isAuthLoading, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
