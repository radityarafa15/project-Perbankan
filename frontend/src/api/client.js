import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT token di setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('smoney_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — redirect ke login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('smoney_token');
      localStorage.removeItem('smoney_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
