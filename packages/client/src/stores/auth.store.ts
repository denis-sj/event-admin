import { create } from 'zustand';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  initialized: boolean;
  login: (token: string) => void;
  logout: () => void;
  init: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  initialized: false,

  login: (token: string) => {
    localStorage.setItem('auth_token', token);
    set({ token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    set({ token: null, isAuthenticated: false });
  },

  init: () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      set({ token, isAuthenticated: true, initialized: true });
    } else {
      set({ initialized: true });
    }
  },
}));
