import React from 'react';
import RegisterForm from '../../components/auth/RegisterForm';
import AuthLanding from '../../components/auth/AuthLanding';
import registerBackground from '../../assets/nenan.png';
import type { AccountProfile } from '../../context/AuthContext';

export interface RegisterPageProps {
  onSwitchToLogin: () => void;
  onSwitchToForgotPassword?: () => void;
  onSuccess: (profile?: AccountProfile) => void;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onSwitchToLogin, onSwitchToForgotPassword, onSuccess }) => {
  return (
    <AuthLanding
      title="Kết nối các dòng họ, lưu giữ nguồn cội"
      subtitle="Tạo tài khoản để quản lý gia phả, khám phá quan hệ họ hàng và kết nối các dòng họ nội – ngoại – dâu – rể."
      backgroundImage={registerBackground}
    >
      <RegisterForm
        onSwitchToLogin={onSwitchToLogin}
        onSwitchToForgotPassword={onSwitchToForgotPassword}
        onSuccess={onSuccess}
      />
    </AuthLanding>
  );
};

export default RegisterPage;
