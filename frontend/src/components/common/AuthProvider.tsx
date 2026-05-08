"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/lib/axios';
import { toast } from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  tenant?: string | null;
  tenant_id?: string | null;
  tenant_name?: string;
  tenant_logo?: string;
  branch?: string;
  branch_id?: string | null;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: (opts?: { confirm?: boolean; reason?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

  const fetchUser = async () => {
    try {
      const res = await api.get('auth/me/');
      setUser(res.data.data);
    } catch (err) {
      toast.error("Failed to load user profile");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = async (opts?: { confirm?: boolean; reason?: string }) => {
    const requireConfirm = opts?.confirm ?? false;
    if (requireConfirm) {
      const ok = window.confirm('Are you sure you want to logout?');
      if (!ok) return;
    }

    try {
      await api.post('auth/logout/');
    } catch (_err) {
      // Ignore API logout failures and force local session clear.
    } finally {
      setUser(null);
      if (opts?.reason) {
        toast.error(opts.reason);
      }
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    if (!user) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const resetInactivityTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        logout({ reason: 'Logged out after 5 minutes of inactivity.' });
      }, INACTIVITY_TIMEOUT_MS);
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
