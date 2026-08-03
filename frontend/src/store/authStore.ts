import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { authApi } from '../api';

export interface User {
  id?: string;
  email?: string;
  full_name?: string;
  role?: 'professor' | 'student';
  has_onboarded?: boolean;
}

export interface AuthState {
  token: string | null;
  role: 'professor' | 'student' | null;
  hasOnboarded: boolean;
  user: User | null;
  setAuth: (token: string, role: 'professor' | 'student', hasOnboarded?: boolean, user?: User) => void;
  logout: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        token: null,
        role: null,
        hasOnboarded: false,
        user: null,

        setAuth: (token, role, hasOnboarded = false, user = undefined) => {
          localStorage.setItem('last_active_role', role);
          set({ token, role, hasOnboarded, user: user || null });
        },

        logout: () => {
          set({ token: null, role: null, hasOnboarded: false, user: null });
        },

        initialize: async () => {
          const token = get().token;
          if (!token) return;

          try {
            const res = await authApi.getCurrentUser();
            const hasOnboarded = Boolean(res.data.has_onboarded);
            const role = res.data.role as 'professor' | 'student';
            localStorage.setItem('last_active_role', role);
            set({
              role,
              token,
              hasOnboarded,
              user: res.data
            });
          } catch (err) {
            set({ token: null, role: null, hasOnboarded: false, user: null });
          }
        }
      }),
      {
        name: 'cobble-auth-storage',
        partialize: (state) => ({
          token: state.token,
          role: state.role,
          hasOnboarded: state.hasOnboarded,
          user: state.user
        })
      }
    ),
    { name: 'AuthStore' }
  )
);
