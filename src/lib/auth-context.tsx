import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('auth') === 'true');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const refreshSession = async (): Promise<boolean> => {
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${API_URL}/api/me`, { credentials: 'include' });
      const data = await res.json();
      if (data?.authenticated) {
        setIsAuthenticated(true);
        localStorage.setItem('auth', 'true');
        return true;
      } else {
        // If server reports unauthenticated, attempt a development fallback using
        // a stored dev token (returned by /api/login in non-production).
        const devToken = localStorage.getItem('devToken');
        if (devToken) {
          try {
            const res2 = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${devToken}` }, credentials: 'include' });
            const data2 = await res2.json();
            if (data2?.authenticated) {
              setIsAuthenticated(true);
              localStorage.setItem('auth', 'true');
              return true;
            }
          } catch (e) {
            // ignore and fall through to clearing state
          }
        }
        setIsAuthenticated(false);
        localStorage.removeItem('auth');
        return false;
      }
    } catch {
      setIsAuthenticated(false);
      localStorage.removeItem('auth');
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    // Check server session on mount
    refreshSession();
  }, []);

  const login = () => {
    setIsAuthenticated(true);
    localStorage.setItem('auth', 'true');
  };

  const logout = async () => {
    setIsAuthLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL ?? '';
      await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      // ignore network errors but still clear client state
    }
    // Refresh session from server to ensure cookie was cleared
    await refreshSession();
    // Clear any dev fallback token used in local development
    if (localStorage) {
      localStorage.removeItem('devToken');
      localStorage.removeItem('auth');
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
