import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('smoney_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('smoney_token');
    if (token) {
      api.get('/auth/me')
        .then(({ data }) => setUser(data.user))
        .catch(() => { logout(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async ({ usernameOrEmail, password }) => {
    const { data } = await api.post('/auth/login', { usernameOrEmail, password });
    localStorage.setItem('smoney_token', data.token);
    localStorage.setItem('smoney_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async ({ name, username, email, password }) => {
    const { data } = await api.post('/auth/register', { name, username, email, password });
    localStorage.setItem('smoney_token', data.token);
    localStorage.setItem('smoney_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('smoney_token');
    localStorage.removeItem('smoney_user');
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    localStorage.setItem('smoney_user', JSON.stringify(data.user));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
