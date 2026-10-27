import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from '../pages/auth/Login';
import RegisterPage from '../pages/auth/Register';
import ForgotPasswordPage from '../pages/auth/ForgotPassword';
import ChangePasswordPage from '../pages/auth/ChangePassword';
import ResetPasswordPage from '../pages/auth/ResetPassword';
import Dashboard from '../pages/dashboard/Dashboard';
import { PublicHomePage } from '../pages/public/Home';
import { PublicFamilySearchPage } from '../pages/public/FamilySearch';
import { BusinessPlansView } from '../pages/public/BusinessPlans';
import { BusinessRegisterWizard } from '../pages/public/BusinessRegister';
import { BusinessTrackStatusPage } from '../pages/public/BusinessTrack';
import { InviteActivationPage } from '../pages/public/InviteActivation';
import { FamilyAdminPreviewPage } from '../features/familyAdmin/FamilyAdminPreviewPage';
import { ProtectedRoute, RoleGuard } from './RouteGuards';
import { homePathFor, useAuthContext, type AccountProfile } from '../context/AuthContext';

export type AuthView = 'login' | 'register' | 'forgot-password' | 'dashboard';

interface AppRoutesProps {
  userName: string;
  primaryRole: string;
  isAuthenticated: boolean;
  onLogout: () => void;
}

const AppRoutes: React.FC<AppRoutesProps> = ({
  userName,
  primaryRole,
  isAuthenticated,
  onLogout,
}) => {
  const navigate = useNavigate();
  const { account } = useAuthContext();
  // [L-17] Phiên hạn chế luôn đi tới /change-password, không bao giờ vào dashboard.
  const homePath = account ? homePathFor(account) : primaryRole === 'admin' ? '/admin' : '/user';

  const handleAuthSuccess = (profile?: AccountProfile) => {
    navigate(homePathFor(profile ?? account));
  };

  const handleLogout = () => {
    onLogout();
    navigate('/login');
  };

  return (
    <Routes>
      {/* Public Guest Routes */}
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/public" element={<PublicHomePage />} />
      <Route path="/public/families" element={<PublicFamilySearchPage />} />
      <Route path="/public/business-plans" element={<BusinessPlansView />} />
      <Route path="/public/business-register" element={<BusinessRegisterWizard />} />
      <Route path="/public/business-register/track" element={<BusinessTrackStatusPage />} />
      <Route path="/activate" element={<InviteActivationPage />} />
      <Route path="/family-admin-preview" element={<FamilyAdminPreviewPage />} />

      {/* Authentication Routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={homePath} replace />
          ) : (
            <LoginPage
              onSwitchToRegister={() => navigate('/register')}
              onSwitchToForgotPassword={() => navigate('/forgot-password')}
              onSuccess={handleAuthSuccess}
            />
          )
        }
      />
      <Route
        path="/register"
        element={
          <RegisterPage
            onSwitchToLogin={() => navigate('/login')}
            onSwitchToForgotPassword={() => navigate('/forgot-password')}
            onSuccess={handleAuthSuccess}
          />
        }
      />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      {/* Liên kết trong email "Quên mật khẩu" của Firebase trỏ về đây (Mốc M4). */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/forgot-password"
        element={
          <ForgotPasswordPage onSwitchToLogin={() => navigate('/login')} />
        }
      />

      {/* Protected User Dashboard Routes */}
      <Route
        path="/user/*"
        element={
          <ProtectedRoute>
            <RoleGuard allowedRoles={['member', 'family_head', 'family_admin']}>
              <Dashboard userName={userName} onLogout={handleLogout} />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      {/* Protected Admin Dashboard Routes */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <RoleGuard allowedRoles={['admin']}>
              <Dashboard userName={userName} onLogout={handleLogout} />
            </RoleGuard>
          </ProtectedRoute>
        }
      />

      {/* Fallback 404 Route */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to={homePath} replace />
          ) : (
            <Navigate to="/public" replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
