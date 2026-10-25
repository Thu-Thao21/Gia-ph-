import React, { useEffect, useState } from 'react';
import './MemberDashboard.css';
import { PersonalizedOverview } from '../../dashboard/PersonalizedOverview';
import { UpcomingEventsWidget } from '../../dashboard/UpcomingEventsWidget';
import { RecentActivitiesWidget } from '../../dashboard/RecentActivitiesWidget';
import { useAuth } from '../../../context/AuthContext';
import { fetchMembers } from '../../../services/member.service';

export interface MemberDashboardProps {
  userName: string;
  userRole: string;
  onNavigateTab?: (tabId: string) => void;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({
  userName,
  userRole,
  onNavigateTab,
}) => {
  const { account } = useAuth();
  const isFamilyOwner = userRole === 'Chủ dòng họ';

  const clanName = account?.clan_name || account?.memberships?.[0]?.clan_name || 'Võ Đại Tộc (Gò Nổi - Quảng Nam)';
  const clanId = account?.clan_id || account?.memberships?.[0]?.clan_id;

  const [familyBranch, setFamilyBranch] = useState<string>(clanName);
  const [generationLevel, setGenerationLevel] = useState<string>('Đời thứ 3');
  const [totalMembers, setTotalMembers] = useState<number>(14);
  const [linkedFamiliesCount, setLinkedFamiliesCount] = useState<number>(2);

  useEffect(() => {
    if (clanName) {
      setFamilyBranch(clanName);
    }
    if (clanId) {
      fetchMembers({ familyId: clanId, limit: 100 })
        .then((res) => {
          if (res?.items && res.items.length > 0) {
            setTotalMembers(res.items.length);
            const myName = (account?.display_name || userName || '').trim().toLowerCase();
            const meInClan = res.items.find(
              (m) => m.fullName.trim().toLowerCase() === myName
            );
            if (meInClan?.generation) {
              setGenerationLevel(`Đời thứ ${meInClan.generation}`);
            }
          }
        })
        .catch(console.error);
    }
  }, [account, clanId, clanName, userName]);

  return (
    <>
      <PersonalizedOverview
        userName={userName}
        userRole={userRole}
        familyBranch={familyBranch}
        generationLevel={generationLevel}
        totalMembers={totalMembers}
        linkedFamiliesCount={linkedFamiliesCount}
      />

      {isFamilyOwner && (
        <div className="member-dash-head-section">
          <div className="member-dash-head-header">
            <div className="member-dash-head-title-row">
              <span className="member-dash-head-icon"></span>
              <h3 className="member-dash-head-title">
                Khu Vực Quản Lý Dòng Họ
              </h3>
            </div>
            <span className="member-dash-head-badge">
              CHỦ DÒNG HỌ
            </span>
          </div>
          <p className="member-dash-head-desc">
            Bạn đang có quyền quản trị dòng họ phụ trách: Quản lý thành viên, Chi/Nhánh, duyệt đề xuất chỉnh sửa và xuất nhập dữ liệu Excel.
          </p>

          <div className="member-dash-head-grid">
            <button
              onClick={() => onNavigateTab && onNavigateTab('family-members')}
              className="member-dash-head-btn"
            >
               Quản lý thành viên
            </button>
            <button
              onClick={() => onNavigateTab && onNavigateTab('family-branches')}
              className="member-dash-head-btn"
            >
               Quản lý Chi & Nhánh
            </button>
            <button
              onClick={() => onNavigateTab && onNavigateTab('family-approvals')}
              className="member-dash-head-btn"
            >
               Phê duyệt đề xuất
            </button>
            <button
              onClick={() => onNavigateTab && onNavigateTab('family-import-export')}
              className="member-dash-head-btn"
            >
               Xuất nhập dữ liệu
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="dashboard-section-header">
          <h2 className="dashboard-section-title">Đời Sống & Sự Kiện Gia Tộc</h2>
          <p className="dashboard-section-subtitle">
            Theo dõi lịch giỗ tổ, mừng thọ và các cập nhật mới nhất trong gia phả.
          </p>
        </div>

        <div className="dashboard-widgets-grid">
          <UpcomingEventsWidget />
          <RecentActivitiesWidget />
        </div>
      </div>
    </>
  );
};

export default MemberDashboard;
