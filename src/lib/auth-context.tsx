import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check server session on mount
    (async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL ?? '';
        const res = await fetch(`${API_URL}/api/me`, { credentials: 'include' });
        const data = await res.json();
        if (data?.authenticated) {
          setIsAuthenticated(true);
          localStorage.setItem('auth', 'true');
        } else {
          setIsAuthenticated(false);
          localStorage.removeItem('auth');
        }
      } catch (err) {
        setIsAuthenticated(false);
        localStorage.removeItem('auth');
      }
    })();
  }, []);

  const login = () => {
    setIsAuthenticated(true);
    localStorage.setItem('auth', 'true');
  };

  const logout = () => {
    // Call server to clear cookie
    (async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL ?? '';
        await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' });
      } catch {}
    })();
    setIsAuthenticated(false);
    localStorage.removeItem('auth');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
