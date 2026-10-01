import { useAuthStore } from '../stores/auth';
import {
  loginRequest,
  registerRequest,
  updateMe,
} from '../api/auth';
import type { ProfileUpdate, RegisterPayload, User } from '../lib/types';

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await loginRequest(email, password);
    setAuth({ user: data.user, access: data.access, refresh: data.refresh });
  };

  const register = async (payload: RegisterPayload): Promise<void> => {
    const data = await registerRequest(payload);
    setAuth({ user: data.user, access: data.access, refresh: data.refresh });
  };

  /** PATCH `/api/auth/me/` and mirror the response into the persisted store. */
  const updateProfile = async (payload: ProfileUpdate): Promise<User> => {
    const updated = await updateMe(payload);
    setUser(updated);
    return updated;
  };

  return {
    user,
    isAuthenticated: accessToken !== null,
    login,
    register,
    logout,
    updateProfile,
  };
}
