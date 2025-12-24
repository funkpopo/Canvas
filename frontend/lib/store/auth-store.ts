"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authApi } from "@/lib/api";

export interface UserInfo {
  id: number;
  username: string;
  email?: string;
  role: string;
  is_active: boolean;
}

interface AuthState {
  token: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  verify: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: true,
      isAuthenticated: false,

      setToken: (token) => {
        if (token) {
          localStorage.setItem("token", token);
        } else {
          localStorage.removeItem("token");
        }
        set({ token });
      },

      verify: async () => {
        const token = get().token ?? localStorage.getItem("token");
        if (!token) {
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        // 确保 store 与 localStorage 一致（API client 可能依赖 localStorage token）
        if (get().token !== token) set({ token });

        set({ isLoading: true });
        try {
          const result = await authApi.verifyToken();
          if (result.valid && result.username) {
            set({
              isAuthenticated: true,
              user: {
                id: result.id || 0,
                username: result.username,
                email: result.email,
                role: result.role || "user",
                is_active: result.is_active !== undefined ? result.is_active : true,
              },
            });
          } else {
            localStorage.removeItem("token");
            set({ token: null, user: null, isAuthenticated: false });
          }
        } catch {
          localStorage.removeItem("token");
          set({ token: null, user: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },

      login: async (token: string) => {
        get().setToken(token);
        await get().verify();
      },

      logout: () => {
        localStorage.removeItem("token");
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      },
    }),
    {
      name: "canvas_auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token }),
    }
  )
);


