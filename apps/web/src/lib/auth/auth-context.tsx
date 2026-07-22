'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '@/lib/auth/token-storage';
import { setAuthToken, setUnauthorizedHandler } from '@/lib/api/client';
import { getMe, login as loginRequest } from '@/lib/api/endpoints';
import type { JwtPayload } from '@/types/contracts';

interface AuthContextValue {
  token: string | null;
  user: JwtPayload | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredToken();
    setAuthToken(null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    async function hydrate() {
      const stored = getStoredToken();
      if (!stored) return;
      setAuthToken(stored);
      try {
        const me = await getMe();
        setToken(stored);
        setUser(me);
      } catch {
        clearStoredToken();
        setAuthToken(null);
      }
    }
    hydrate().finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken } = await loginRequest(email, password);
    setStoredToken(accessToken);
    setAuthToken(accessToken);
    const me = await getMe();
    setToken(accessToken);
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, user, isLoading, login, logout }),
    [token, user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
