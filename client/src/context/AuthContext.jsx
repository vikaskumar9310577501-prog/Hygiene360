import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('h360_token') || null);
  const [loading, setLoading] = useState(true);
  const [plants, setPlants] = useState([]);
  const [activePlantId, setActivePlantId] = useState(localStorage.getItem('h360_plant_id') || '');
  const [dateFilter, setDateFilter] = useState(new Date().toLocaleDateString('en-CA'));
  const [unreadCount, setUnreadCount] = useState(0);

  // Initialize auth state
  useEffect(() => {
    async function init() {
      if (token) {
        try {
          const profile = await api.get('/auth/me');
          setUser(profile.user);
          if (profile.user.plant_id) {
            setActivePlantId(String(profile.user.plant_id));
          }
        } catch (err) {
          console.warn('Session expired, logging out');
          logout();
        }
      }

      setLoading(false);
    }
    init();
  }, [token]);

  // Load plants
  useEffect(() => {
    if (user) {
      api.get('/admin/plants')
        .then(res => {
          setPlants(res.plants || []);
          if (!activePlantId && res.plants && res.plants.length > 0) {
            const bhiwadi = res.plants.find(p => p.code === 'BHIWADI') || res.plants[0];
            setActivePlantId(String(bhiwadi.id));
          }
        })
        .catch(err => console.error('Failed to load plants:', err));

      // Fetch unread notifications
      api.get('/notifications')
        .then(res => setUnreadCount(res.unreadCount || 0))
        .catch(() => {});
    }
  }, [user]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('h360_token', res.token);
    setToken(res.token);
    setUser(res.user);
    if (res.user.plant_id) {
      setActivePlantId(String(res.user.plant_id));
      localStorage.setItem('h360_plant_id', String(res.user.plant_id));
    }
    return res.user;
  };

  const sendOtp = async (email) => {
    const res = await api.post('/auth/send-otp', { email });
    return res;
  };

  const loginWithOtp = async (email, otp) => {
    const res = await api.post('/auth/verify-otp', { email, otp });
    localStorage.setItem('h360_token', res.token);
    setToken(res.token);
    setUser(res.user);
    if (res.user.plant_id) {
      setActivePlantId(String(res.user.plant_id));
      localStorage.setItem('h360_plant_id', String(res.user.plant_id));
    }
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('h360_token');
    localStorage.removeItem('h360_plant_id');
    setToken(null);
    setUser(null);
    setActivePlantId('');
    setUnreadCount(0);
  };

  const changePlant = (plantId) => {
    setActivePlantId(String(plantId));
    localStorage.setItem('h360_plant_id', String(plantId));
  };

  const refreshNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setUnreadCount(res.unreadCount || 0);
    } catch (e) {}
  };

  const refreshPlants = async () => {
    try {
      const res = await api.get('/admin/plants');
      setPlants(res.plants || []);
      return res.plants || [];
    } catch (e) {
      console.error('Failed to refresh plants:', e);
      return [];
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      plants,
      refreshPlants,
      activePlantId,
      dateFilter,
      setDateFilter,
      unreadCount,
      login,
      sendOtp,
      loginWithOtp,
      logout,
      changePlant,
      refreshNotifications
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
