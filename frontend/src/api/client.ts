import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Create axios instance with default config
const api = axios.create({
  baseURL: 'http://127.0.0.1:8000',
});

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
