import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Get API URL from environment variable or fallback to 127.0.0.1:8000
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes — local LLM calls (study plans, tests) can take 2-3 min
});

// Export API URL for components that need it
export const API_URL = API_BASE_URL;

// Request interceptor - add auth token to all requests
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Skip redirect for /users/me — the authStore.initialize() handles
      // stale-token cleanup itself; letting the interceptor also redirect
      // causes duplicate cleanup and redirect loops.
      const requestUrl = error.config?.url || '';
      const isInitCheck = requestUrl.includes('/users/me');

      if (!isInitCheck) {
        console.warn('401 Unauthorized - token expired or invalid, redirecting to login');
        useAuthStore.getState().logout();

        // Only redirect if we're not already on a public page
        const currentPath = window.location.pathname;
        const isPublicPage =
          currentPath === '/' ||
          currentPath.startsWith('/login/') ||
          currentPath.startsWith('/signup/');
        if (!isPublicPage) {
          window.location.href = '/login/professor';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
