import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { FirstLoginPasswordModal } from '../../components/auth/FirstLoginPasswordModal';
import { homePathFor, useAuthContext } from '../../context/AuthContext';

/**
 * [L-17] Màn đổi mật khẩu bắt buộc. Phiên hạn chế (requires_password_change = true) được
 * đưa thẳng tới đây sau khi đăng nhập và không vào được dashboard cho tới khi đổi xong.
 */
const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { account, loading, logout } = useAuthContext();

  if (loading) {
    return (
      <div className="route-loading-screen">
        <p>Đang xác thực thông tin tài khoản...</p>
      </div>
    );
  }
  if (!account) return <Navigate to="/login" replace />;
  if (!account.requires_password_change) return <Navigate to={homePathFor(account)} replace />;

  return (
    <FirstLoginPasswordModal
      isOpen
      // Đổi thành công: BE đã cấp phiên mới (không còn hạn chế), vào thẳng trang của vai trò.
      onSuccess={(profile) => navigate(homePathFor(profile), { replace: true })}
      onCancel={async () => {
        await logout();
        navigate('/login', { replace: true });
      }}
    />
  );
};

export default ChangePasswordPage;
