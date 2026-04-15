import api from './client';

// Auth API
export const authApi = {
  login: (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/auth/jwt/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  
  register: (data: { email: string; password: string; name: string; role: string }) => {
    return api.post('/auth/register', data);
  },
  
  getCurrentUser: () => {
    return api.get('/users/me');
  },
  
  updateUser: (data: Record<string, any>) => {
    return api.patch('/users/me', data);
  },
  
  logout: () => {
    return api.post('/auth/jwt/logout');
  },
};

export default authApi;
