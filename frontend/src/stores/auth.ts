import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../lib/types';

export interface AuthCredentials {
  user: User;
  access: string;
  refresh: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Store a full login/registration session. */
  setAuth: (credentials: AuthCredentials) => void;
  /** Store tokens only — used by the 401 refresh interceptor. */
  setTokens: (access: string, refresh?: string) => void;
  /** Replace the cached profile — used after `PATCH /api/auth/me/`. */
  setUser: (user: User) => void;
  logout: () => void;
}

const EMPTY: Pick<AuthState, 'user' | 'accessToken' | 'refreshToken'> = {
  user: null,
  accessToken: null,
  refreshToken: null,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setAuth: ({ user, access, refresh }) =>
        set({ user, accessToken: access, refreshToken: refresh }),
      setTokens: (access, refresh) =>
        set((state) => ({
          accessToken: access,
          // Only overwrite the refresh token when the backend rotates it.
          refreshToken: refresh !== undefined ? refresh : state.refreshToken,
        })),
      setUser: (user) => set({ user }),
      logout: () => set({ ...EMPTY }),
    }),
    { name: 'apiforge-auth' },
  ),
);
