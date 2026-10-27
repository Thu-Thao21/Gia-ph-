import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthContext } from './AuthContext';
import type { MembershipSummary } from '../types/auth';

export interface ClanContextType {
  activeClanId: string | null;
  activeClanName: string | null;
  activeMembership: MembershipSummary | null;
  activeClanRole: 'clan_admin' | 'family_admin' | 'member' | '';
  activeClanRoleLabel: string;
  activeClanPermissions: string[];
  availableClans: MembershipSummary[];
  allMemberships: MembershipSummary[];
  isClanLoading: boolean;
  clanSwitchCount: number;
  selectClan: (clanId: string, bypassUnsavedCheck?: boolean) => boolean;
  setActiveClanId: (clanId: string | null) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (val: boolean) => void;
  isPendingSwitch: boolean;
  pendingClanId: string | null;
  confirmPendingSwitch: () => void;
  cancelPendingSwitch: () => void;
}

const ClanContext = createContext<ClanContextType | undefined>(undefined);

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  clan_admin: 'Trưởng tộc',
  family_admin: 'Family Admin',
  member: 'Thành viên',
};

export const ClanProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { account, loading: authLoading } = useAuthContext();

  const [activeClanId, setActiveClanId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isPendingSwitch, setIsPendingSwitch] = useState<boolean>(false);
  const [pendingClanId, setPendingClanId] = useState<string | null>(null);
  const [clanSwitchCount, setClanSwitchCount] = useState<number>(0);

  // Tất cả memberships từ account
  const allMemberships = useMemo(() => {
    return account?.memberships || [];
  }, [account?.memberships]);

  // Các cây hợp lệ (cả clan_status và membership_status đều ACTIVE)
  const availableClans = useMemo(() => {
    return allMemberships.filter(
      (m) => m.membership_status === 'ACTIVE' && m.clan_status === 'ACTIVE'
    );
  }, [allMemberships]);

  // Khôi phục hoặc khởi tạo clan đang chọn theo tài khoản và sessionStorage của tab
  useEffect(() => {
    if (authLoading) return;

    if (!account || availableClans.length === 0) {
      setActiveClanId(null);
      return;
    }

    const sessionKey = `mfgms_active_clan_${account.id}`;
    const savedClanId = typeof window !== 'undefined' ? window.sessionStorage.getItem(sessionKey) : null;

    if (savedClanId && availableClans.some((c) => String(c.clan_id).toLowerCase() === String(savedClanId).toLowerCase())) {
      setActiveClanId(savedClanId);
    } else {
      // Chọn cây hợp lệ đầu tiên theo thứ tự ổn định
      const defaultClanId = availableClans[0].clan_id;
      setActiveClanId(defaultClanId);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(sessionKey, defaultClanId);
      }
    }
  }, [account?.id, availableClans, authLoading]);

  // Membership tương ứng với clan đang chọn
  const activeMembership = useMemo(() => {
    if (!activeClanId) return null;
    return availableClans.find(
      (c) => String(c.clan_id).toLowerCase() === String(activeClanId).toLowerCase()
    ) || null;
  }, [activeClanId, availableClans]);

  const activeClanName = activeMembership?.clan_name || null;

  // Xác định vai trò có hiệu lực tại cây đó (KHÔNG lấy từ cây khác)
  const activeClanRole: 'clan_admin' | 'family_admin' | 'member' | '' = useMemo(() => {
    if (!activeMembership) return '';
    const roles = activeMembership.roles || [];
    if (roles.includes('BUSINESS_OWNER')) return 'clan_admin';
    if (roles.includes('FAMILY_ADMIN')) return 'family_admin';
    return 'member';
  }, [activeMembership]);

  const activeClanRoleLabel = useMemo(() => {
    if (!activeClanRole) return '';
    return ROLE_DISPLAY_NAMES[activeClanRole] || 'Thành viên';
  }, [activeClanRole]);

  // Quyền cụ thể được cấp tại cây đang chọn
  const activeClanPermissions = useMemo(() => {
    return activeMembership?.permissions || [];
  }, [activeMembership]);

  // Chuyển cây an toàn
  const selectClan = useCallback(
    (clanId: string, bypassUnsavedCheck = false): boolean => {
      if (!clanId) return false;
      if (String(clanId).toLowerCase() === String(activeClanId || '').toLowerCase()) return true;

      const targetClan = availableClans.find(
        (c) => String(c.clan_id).toLowerCase() === String(clanId).toLowerCase()
      );
      if (!targetClan) {
        console.warn(`Clan ${clanId} không hợp lệ hoặc đã bị vô hiệu hóa.`);
        return false;
      }

      if (hasUnsavedChanges && !bypassUnsavedCheck) {
        setPendingClanId(clanId);
        setIsPendingSwitch(true);
        return false;
      }

      setActiveClanId(clanId);
      setClanSwitchCount((prev) => prev + 1);
      setHasUnsavedChanges(false);
      setIsPendingSwitch(false);
      setPendingClanId(null);

      if (account?.id && typeof window !== 'undefined') {
        window.sessionStorage.setItem(`mfgms_active_clan_${account.id}`, clanId);
      }
      return true;
    },
    [activeClanId, availableClans, hasUnsavedChanges, account?.id]
  );

  const handleSetActiveClanId = useCallback((clanId: string | null) => {
    if (clanId) {
      selectClan(clanId);
    } else {
      setActiveClanId(null);
    }
  }, [selectClan]);

  const confirmPendingSwitch = useCallback(() => {
    if (pendingClanId) {
      selectClan(pendingClanId, true);
    }
  }, [pendingClanId, selectClan]);

  const cancelPendingSwitch = useCallback(() => {
    setIsPendingSwitch(false);
    setPendingClanId(null);
  }, []);

  return (
    <ClanContext.Provider
      value={{
        activeClanId,
        activeClanName,
        activeMembership,
        activeClanRole,
        activeClanRoleLabel,
        activeClanPermissions,
        availableClans,
        allMemberships,
        isClanLoading: authLoading,
        clanSwitchCount,
        selectClan,
        setActiveClanId: handleSetActiveClanId,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        isPendingSwitch,
        pendingClanId,
        confirmPendingSwitch,
        cancelPendingSwitch,
      }}
    >
      {children}

      {/* Modal Cảnh báo chuyển cây khi có thay đổi chưa lưu */}
      {isPendingSwitch && (
        <div className="clan-switch-confirm-overlay" role="dialog" aria-modal="true" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px 32px',
            maxWidth: '460px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '28px' }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 700, color: '#0f172a' }}>
                Thay đổi chưa được lưu
              </h3>
            </div>
            <p style={{ fontSize: '14.5px', color: '#475569', lineHeight: 1.6, margin: '0 0 24px 0' }}>
              Bạn đang có thông tin nhập dở chưa được lưu tại cây <strong>{activeClanName || 'hiện tại'}</strong>. 
              Nếu chuyển sang cây <strong>{availableClans.find(c => c.clan_id === pendingClanId)?.clan_name || 'mới'}</strong>, bản nháp sẽ bị hủy bỏ và không thể khôi phục.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={cancelPendingSwitch}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Ở lại chỉnh sửa
              </button>
              <button
                type="button"
                onClick={confirmPendingSwitch}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Hủy nháp & Chuyển cây
              </button>
            </div>
          </div>
        </div>
      )}
    </ClanContext.Provider>
  );
};

export function useClanContext() {
  const context = useContext(ClanContext);
  if (!context) {
    throw new Error('useClanContext must be used within a ClanProvider');
  }
  return context;
}
