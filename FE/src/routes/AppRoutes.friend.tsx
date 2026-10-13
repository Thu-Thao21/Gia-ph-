import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from '../pages/auth/Login';
import RegisterPage from '../pages/auth/Register';
import ForgotPasswordPage from '../pages/auth/ForgotPassword';
import Dashboard from '../pages/dashboard/Dashboard';
import { PublicHomePage } from '../pages/public/Home';
import { PublicFamilySearchPage } from '../pages/public/FamilySearch';
import { BusinessPlansView } from '../pages/public/BusinessPlans';
import { BusinessRegisterWizard } from '../pages/public/BusinessRegister';
import { BusinessTrackStatusPage } from '../pages/public/BusinessTrack';
import { InviteActivationPage } from '../pages/public/InviteActivation';
import { ProtectedRoute, RoleGuard } from './RouteGuards';

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

  const handleAuthSuccess = () => {
    navigate('/user');
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

      {/* Authentication Routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/user" replace />
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
            onSuccess={handleAuthSuccess}
          />
        }
      />
      <Route
        path="/forgot-password"
        element={
          <ForgotPasswordPage onSwitchToLogin={() => navigate('/login')} />
        }
      />

      {/* Protected User Dashboard Routes */}
      <Route
        path="/user/*"
        element={<Dashboard userName="Test User" onLogout={handleLogout} />}
      />

      {/* Admin Dashboard Routes Redirect to /user */}
      <Route
        path="/admin/*"
        element={<Navigate to="/user" replace />}
      />

      {/* Fallback 404 Route */}
      <Route
        path="*"
        element={
          isAuthenticated ? (
            <Navigate to="/user" replace />
          ) : (
            <Navigate to="/public" replace />
          )
        }
      />
    </Routes>
  );
};

export default AppRoutes;
