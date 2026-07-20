import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { SetupRequired } from '../pages/SetupRequired';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth();
  const location = useLocation();

  if (!configured) return <SetupRequired />;
  if (loading) {
    return (
      <div className="route-loader" role="status">
        <span />
        <p>Checking your workspace session</p>
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  return children;
}
