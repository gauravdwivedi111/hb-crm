import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types/api.types';
import { api, setAccessToken, registerAuthCallbacks } from '../services/api';

export interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync state if api.ts transparently refreshes tokens or encounters auth failure
  useEffect(() => {
    registerAuthCallbacks(
      (newToken, updatedUser) => {
        setAccessTokenState(newToken);
        if (updatedUser) {
          setUser(updatedUser);
        }
      },
      () => {
        setAccessTokenState(null);
        setUser(null);
      },
    );

    return () => {
      registerAuthCallbacks(null, null);
    };
  }, []);

  // Silent refresh on app load via httpOnly refresh cookie
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async (): Promise<void> => {
      try {
        const data = await api.auth.refresh();
        if (isMounted && data?.accessToken) {
          setAccessToken(data.accessToken);
          setAccessTokenState(data.accessToken);
          setUser(data.user);
        }
      } catch {
        // No active refresh cookie or refresh token revoked
        if (isMounted) {
          setAccessToken(null);
          setAccessTokenState(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      const data = await api.auth.login(email, password);
      setAccessToken(data.accessToken);
      setAccessTokenState(data.accessToken);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.auth.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setAccessToken(null);
      setAccessTokenState(null);
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
