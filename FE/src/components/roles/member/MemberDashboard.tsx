import React, { useEffect, useState, useMemo } from 'react';
import './MemberDashboard.css';
import { PersonalizedOverview } from '../../dashboard/PersonalizedOverview';
import { UpcomingEventsWidget } from '../../dashboard/UpcomingEventsWidget';
import { RecentActivitiesWidget } from '../../dashboard/RecentActivitiesWidget';
import { ClanLeaderDashboardSection } from '../../dashboard/ClanLeaderDashboardSection';
import { useAuth } from '../../../context/AuthContext';
import { useClanContext } from '../../../context/ClanContext';
import { fetchMembers } from '../../../services/member.service';
import { fetchInterClanLinks } from '../../../services/network.service';

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
  const {
    activeClanId,
    activeClanName,
    activeMembership,
    activeClanRole,
    activeClanRoleLabel,
    clanSwitchCount,
  } = useClanContext();

  const effectiveClanId = activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id;
  const effectiveClanName =
    activeClanName ||
    activeMembership?.clan_name ||
    account?.clan_name ||
    account?.memberships?.[0]?.clan_name ||
    'Chưa tham gia dòng họ';

  const hasClan = Boolean(effectiveClanId && effectiveClanName && effectiveClanName !== 'Chưa tham gia dòng họ');

  const effectiveRole = activeClanRoleLabel || userRole || 'Thành viên';
  const isFamilyOwner =
    activeClanRole === 'clan_admin' ||
    activeClanRole === 'family_admin' ||
    effectiveRole === 'Chủ dòng họ' ||
    effectiveRole === 'Trưởng tộc' ||
    effectiveRole === 'Clan Admin' ||
    effectiveRole === 'Family Admin';

  const [familyBranch, setFamilyBranch] = useState<string>(effectiveClanName);
  const [generationLevel, setGenerationLevel] = useState<string>('--');
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [linkedFamiliesCount, setLinkedFamiliesCount] = useState<number>(0);
  const [membersList, setMembersList] = useState<any[]>([]);

  useEffect(() => {
    setFamilyBranch(effectiveClanName);

    if (!effectiveClanId || !hasClan) {
      setMembersList([]);
      setTotalMembers(0);
      setGenerationLevel('--');
      setLinkedFamiliesCount(0);
      return;
    }

    let isCancelled = false;

    // 1. Lấy dữ liệu thành viên thực tế của dòng họ đang chọn từ database
    fetchMembers({ familyId: effectiveClanId, limit: 1000 })
      .then((res) => {
        if (isCancelled) return;
        if (res?.items && res.items.length > 0) {
          setMembersList(res.items);
          setTotalMembers(res.total || res.items.length);

          const myName = (account?.display_name || userName || '').trim().toLowerCase();
          const meInClan = res.items.find(
            (m) =>
              (activeMembership?.person_id && m.id === activeMembership.person_id) ||
              ((m as any).userId &&
                ((m as any).userId === (account as any)?.user_id ||
                  (m as any).userId === account?.id)) ||
              m.fullName.trim().toLowerCase() === myName
          );

          if (meInClan?.generation) {
            setGenerationLevel(`Đời thứ ${meInClan.generation}`);
          } else if (isFamilyOwner) {
            const gens = Array.from(new Set(res.items.map((m: any) => m.generation).filter(Boolean))) as number[];
            const maxGen = gens.length > 0 ? Math.max(...gens) : 0;
            setGenerationLevel(maxGen > 0 ? `${maxGen} thế hệ (Trưởng tộc)` : 'Quản trị Trưởng tộc');
          } else {
            setGenerationLevel('Chưa liên kết');
          }
        } else {
          setMembersList([]);
          setTotalMembers(0);
          setGenerationLevel('Đời thứ --');
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Lỗi khi tải thành viên dòng họ:', err);
          setMembersList([]);
          setTotalMembers(0);
          setGenerationLevel('Đời thứ --');
        }
      });

    // 2. Lấy số lượng liên kết dòng họ thực tế từ database
    fetchInterClanLinks('ACTIVE')
      .then((links) => {
        if (isCancelled) return;
        if (Array.isArray(links)) {
          const curId = String(effectiveClanId).toLowerCase();
          const activeLinks = links.filter((l: any) => {
            const a = String(l.clanAId || l.clan_a_id || '').toLowerCase();
            const b = String(l.clanBId || l.clan_b_id || '').toLowerCase();
            return (a === curId || b === curId) && l.status === 'ACTIVE';
          });
          setLinkedFamiliesCount(activeLinks.length);
        }
      })
      .catch((err) => {
        if (!isCancelled) console.error('Lỗi khi tải liên kết dòng họ:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [
    effectiveClanId,
    effectiveClanName,
    hasClan,
    clanSwitchCount,
    activeMembership?.person_id,
    account?.id,
    (account as any)?.user_id,
    account?.display_name,
    userName,
  ]);

  // Tự động tính toán ngày giỗ từ danh sách thành viên tiền nhân trong dòng họ
  const upcomingEvents = useMemo(() => {
    if (!membersList || membersList.length === 0) return [];

    const deceasedWithDates = membersList.filter((m) => m.deathDate && (!m.isAlive || m.isAlive === false));
    if (deceasedWithDates.length === 0) return [];

    return deceasedWithDates.slice(0, 4).map((m, idx) => {
      const dStr = m.deathDate;
      const dObj = new Date(dStr);
      const isDateValid = !isNaN(dObj.getTime());
      const formattedDate = isDateValid
        ? `Ngày ${dObj.getDate().toString().padStart(2, '0')}/${(dObj.getMonth() + 1).toString().padStart(2, '0')} (Âm lịch)`
        : `Năm mất: ${dStr}`;

      return {
        id: m.id || idx,
        title: `Lễ giỗ Cụ ${m.fullName}`,
        date: formattedDate,
        countdown: (m.generation && m.generation <= 2) ? 'Đời tiên tổ' : `Đời ${m.generation || 1}`,
        location: `Từ đường ${effectiveClanName}`,
        family: effectiveClanName,
      };
    });
  }, [membersList, effectiveClanName]);

  // Hoạt động phả hệ gần đây dựa trên dữ liệu dòng họ
  const recentActivities = useMemo(() => {
    if (!membersList || membersList.length === 0) return [];
    return [
      {
        id: 1,
        user: effectiveClanName,
        action: `đã đồng bộ thành công ${totalMembers} thành viên và dữ liệu phả hệ vào cây.`,
        time: 'Vừa xong',
      },
      {
        id: 2,
        user: 'Hệ thống phả hệ',
        action: 'đã xác thực và liên kết các chi nhánh, trực hệ tự động.',
        time: 'Hôm nay',
      },
    ];
  }, [membersList, totalMembers, effectiveClanName]);

  return (
    <>
      <PersonalizedOverview
        userName={userName}
        userRole={effectiveRole}
        familyBranch={familyBranch}
        generationLevel={generationLevel}
        totalMembers={totalMembers}
        linkedFamiliesCount={linkedFamiliesCount}
        lineageType={activeMembership?.lineage_type}
        hasClan={hasClan}
      />

      {/* Khối Thống Kê & Sơ Đồ Cột Chuyên Sâu Cho Trưởng Tộc / Quản Trị Viên */}
      {isFamilyOwner && hasClan && (
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
          <UpcomingEventsWidget events={upcomingEvents} />
          <RecentActivitiesWidget activities={recentActivities} />
        </div>
      </div>
    </>
  );
};

export default MemberDashboard;
