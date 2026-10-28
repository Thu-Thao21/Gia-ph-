import React, { useMemo } from 'react';
import AppRoutes from './routes/AppRoutes';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const { account, isAuthenticated, logout } = useAuth();

  const userName = useMemo(
    () => account?.display_name || account?.username || 'Người dùng',
    [account]
  );

  const primaryRole = account?.primary_role || 'member';

  return (
    <AppRoutes
      userName={userName}
      primaryRole={primaryRole}
      isAuthenticated={isAuthenticated}
      onLogout={logout}
    />
  );
}
