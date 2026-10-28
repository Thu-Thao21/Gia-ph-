import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import './RouteGuards.css';

// Standard React Router v6 imports handled safely
interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, account } = useAuthContext();

  if (loading) {
    return (
      <div className="route-loading-screen">
        <p>Đang xác thực thông tin tài khoản...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // [L-17] Phiên hạn chế: BE chỉ cho /auth/me, /auth/change-password, /auth/logout, nên đi thẳng
  // tới màn đổi mật khẩu thay vì vào dashboard.
  if (account?.requires_password_change) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
};

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { account, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="route-loading-screen">
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  if (!account) {
    return <Navigate to="/login" replace />;
  }

  const primaryRole = (account.primary_role || '').toLowerCase();
  const activeRoles = (account.roles || [])
    .filter((r) => r.status === 'active')
    .map((r) => r.role.toLowerCase());

  const isAdmin = primaryRole === 'admin' || activeRoles.includes('admin');
  const isRequireAdmin = allowedRoles.map((r) => r.toLowerCase()).includes('admin');

  if (isRequireAdmin) {
    if (!isAdmin) {
      return <Navigate to="/user" replace />;
    }
  } else {
    if (isAdmin) {
      return <Navigate to="/admin" replace />;
    }
    const hasRole = allowedRoles.some((r) => activeRoles.includes(r.toLowerCase()) || primaryRole === r.toLowerCase());
    if (!hasRole) {
      return <Navigate to="/login" replace />;
    }
  }

  return <>{children}</>;
};
