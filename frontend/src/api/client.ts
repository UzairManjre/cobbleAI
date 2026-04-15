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
      console.warn('401 Unauthorized - token expired or invalid, redirecting to login');
      useAuthStore.getState().logout();

      // Only redirect if we're not already on a login page
      const currentPath = window.location.pathname;
      if (!currentPath.startsWith('/login/') && !currentPath.startsWith('/signup/')) {
        window.location.href = '/login/professor';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
