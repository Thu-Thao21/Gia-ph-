import React, { useEffect, useState } from 'react';
import './MemberDashboard.css';
import { PersonalizedOverview } from '../../dashboard/PersonalizedOverview';
import { UpcomingEventsWidget } from '../../dashboard/UpcomingEventsWidget';
import { RecentActivitiesWidget } from '../../dashboard/RecentActivitiesWidget';
import { ClanLeaderDashboardSection } from '../../dashboard/ClanLeaderDashboardSection';
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
  const isFamilyOwner = userRole === 'Chủ dòng họ' || userRole === 'Trưởng tộc' || userRole === 'Clan Admin';

  const clanName = account?.clan_name || account?.memberships?.[0]?.clan_name || 'Mai Thế Tộc';
  const clanId = account?.clan_id || account?.memberships?.[0]?.clan_id;

  const [familyBranch, setFamilyBranch] = useState<string>(clanName);
  const [generationLevel, setGenerationLevel] = useState<string>('--');
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [linkedFamiliesCount, setLinkedFamiliesCount] = useState<number>(0);
  const [membersList, setMembersList] = useState<any[]>([]);

  useEffect(() => {
    if (clanName) {
      setFamilyBranch(clanName);
    }
    if (clanId) {
      fetchMembers({ familyId: clanId, limit: 100 })
        .then((res) => {
          if (res?.items && res.items.length > 0) {
            setMembersList(res.items);
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

      {/* Khối Thống Kê & Sơ Đồ Cột Chuyên Sâu Cho Trưởng Tộc */}
      {isFamilyOwner && (
        <ClanLeaderDashboardSection
          clanName={familyBranch}
          totalMembers={totalMembers}
          membersList={membersList}
          onNavigateTab={onNavigateTab}
        />
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
