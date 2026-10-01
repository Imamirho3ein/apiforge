import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { fetchMe } from '../api/auth';
import { isUnauthorizedError } from '../lib/api';
import { useAuthStore } from '../stores/auth';

/** Guards every authenticated route; unauthenticated visitors go to /login. */
export function ProtectedRoute() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);

  // Validate the session restored from localStorage once, so a stale or revoked
  // refresh token is caught here instead of on the first data request. A
  // network blip must not sign the user out, hence the status check.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch((error: unknown) => {
        if (!cancelled && isUnauthorizedError(error)) logout();
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, setUser, logout]);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
