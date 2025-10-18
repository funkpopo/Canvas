"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from './api';

interface UserInfo {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('token');

    if (!token) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await authApi.verifyToken();
      if (result.valid && result.username) {
        setIsAuthenticated(true);
        setUser({
          id: result.id || 0,
          username: result.username,
          email: result.email,
          role: result.role || 'user',
          is_active: result.is_active !== undefined ? result.is_active : true
        });
      } else {
        // Token无效，清除存储
        localStorage.removeItem('token');
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch {
      // 验证失败，清除token
      localStorage.removeItem('token');
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (token: string) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
    // 重新验证以获取用户信息
    checkAuthStatus();
  };

  const logout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      user,
      login,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
