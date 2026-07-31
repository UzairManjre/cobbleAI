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
      (set) => ({
        token: localStorage.getItem('token'),
        role: localStorage.getItem('role') as 'professor' | 'student' | null,
        hasOnboarded: localStorage.getItem('hasOnboarded') === 'true',
        user: null,

        setAuth: (token, role, hasOnboarded = false, user = undefined) => {
          localStorage.setItem('token', token);
          localStorage.setItem('role', role);
          localStorage.setItem('hasOnboarded', String(hasOnboarded));
          set({ token, role, hasOnboarded, user: user || null });
        },

        logout: () => {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('hasOnboarded');
          set({ token: null, role: null, hasOnboarded: false, user: null });
        },

        initialize: async () => {
          const token = localStorage.getItem('token');
          if (!token) return;

          try {
            const res = await authApi.getCurrentUser();
            const hasOnboarded = Boolean(res.data.has_onboarded);
            const role = res.data.role as 'professor' | 'student';
            localStorage.setItem('hasOnboarded', String(hasOnboarded));
            set({
              role,
              token,
              hasOnboarded,
              user: res.data
            });
          } catch (err) {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('hasOnboarded');
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
