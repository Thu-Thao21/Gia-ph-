import React from 'react';
import { useLocation } from 'react-router-dom';
import LoginForm from '../../components/auth/LoginForm';
import AuthLanding from '../../components/auth/AuthLanding';
import loginBackground from '../../assets/nenan.png';
import type { AccountProfile } from '../../context/AuthContext';

export interface LoginPageProps {
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword?: () => void;
  onSuccess: (profile?: AccountProfile) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister, onSwitchToForgotPassword, onSuccess }) => {
  // Thông báo do trang trước gửi sang (vd: sau khi đặt lại mật khẩu thành công).
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  return (
    <AuthLanding
      title="Kết nối các dòng họ, lưu giữ nguồn cội"
      subtitle="Quản lý gia phả, khám phá quan hệ họ hàng và kết nối các dòng họ nội – ngoại – dâu – rể."
      backgroundImage={loginBackground}
    >
      <LoginForm
        onSwitchToRegister={onSwitchToRegister}
        onSwitchToForgotPassword={onSwitchToForgotPassword}
        onSuccess={onSuccess}
        notice={notice}
      />
    </AuthLanding>
  );
};

export default LoginPage;
