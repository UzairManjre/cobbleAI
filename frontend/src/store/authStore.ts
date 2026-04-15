import { create } from 'zustand';
import { authApi } from '../api';

interface AuthState {
  token: string | null;
  role: 'professor' | 'student' | null;
  hasOnboarded: boolean;
  setAuth: (token: string, role: 'professor' | 'student', hasOnboarded?: boolean) => void;
  logout: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  role: localStorage.getItem('role') as 'professor' | 'student' | null,
  hasOnboarded: localStorage.getItem('hasOnboarded') === 'true',
  setAuth: (token, role, hasOnboarded = false) => {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('hasOnboarded', String(hasOnboarded));
    set({ token, role, hasOnboarded });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    set({ token: null, role: null });
  },
  initialize: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await authApi.getCurrentUser();
      localStorage.setItem('hasOnboarded', String(res.data.has_onboarded));
      set({
        role: res.data.role,
        token,
        hasOnboarded: res.data.has_onboarded
      });
    } catch (err) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('hasOnboarded');
      set({ token: null, role: null, hasOnboarded: false });
    }
  }
}));
