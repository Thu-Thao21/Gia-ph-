import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useClanContext } from '../../../context/ClanContext';
import { fetchFamilies, fetchMembers } from '../../../services/member.service';
import type { Family, Member } from '../../../types/member';
import { GenderAvatar } from '../../common/GenderAvatar';
import './MemberList.css';

export interface MemberListProps {
  onSelectMember: (memberId: string) => void;
  initialFamilyId?: string;
}

export const MemberList: React.FC<MemberListProps> = ({ onSelectMember, initialFamilyId }) => {
  const { account } = useAuth();
  const { activeClanId, availableClans } = useClanContext();
  const isAdmin = account?.primary_role === 'admin';
  const userClanId = initialFamilyId || activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id;

  const [members, setMembers] = useState<Member[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(userClanId || '');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Đồng bộ selectedFamilyId khi activeClanId thay đổi từ TopBar
  useEffect(() => {
    if (activeClanId && !isAdmin) {
      setSelectedFamilyId(activeClanId);
    }
  }, [activeClanId, isAdmin]);

  useEffect(() => {
    fetchFamilies().then((data) => {
      const allowedClanIds = availableClans.map((c) => c.clan_id);
      const allowedFams = isAdmin
        ? data
        : data.filter((f) => allowedClanIds.includes(f.id) || f.id === userClanId);
      setFamilies(allowedFams);
      if (userClanId && data.some((f) => f.id === userClanId)) {
        setSelectedFamilyId(userClanId);
      } else if (allowedFams.length > 0) {
        setSelectedFamilyId(allowedFams[0].id);
      }
    });
  }, [isAdmin, userClanId, availableClans]);

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    fetchMembers({ familyId: selectedFamilyId || undefined, search: searchTerm }).then((res) => {
      if (!isCancelled) {
        setMembers(res.items);
        setLoading(false);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedFamilyId, searchTerm]);

  return (
    <div className="member-list-container">
      <div className="member-list-header">
        <div>
          <h2 className="member-list-title">Danh Sách Thành Viên Gia Tộc</h2>
          <p className="member-list-subtitle">
            Tra cứu hồ sơ, thế hệ và thông tin cá nhân của các thành viên trong dòng họ.
          </p>
        </div>

        <div className="member-list-controls">
          <input
            type="text"
            className="member-search-input"
            placeholder="Tìm tên, nghề nghiệp..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            className="member-select-filter"
            value={selectedFamilyId}
            onChange={(e) => setSelectedFamilyId(e.target.value)}
          >
            {isAdmin && <option value="">-- Tất cả dòng họ --</option>}
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.memberCount} thành viên)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="member-table-card">
        {loading ? (
          <div className="member-table-prompt-loading">
             Đang tải danh sách thành viên từ cơ sở dữ liệu...
          </div>
        ) : members.length === 0 ? (
          <div className="member-table-prompt-empty">
             Chưa có thành viên nào phù hợp với bộ lọc.
          </div>
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Giới tính</th>
                <th>Thế hệ</th>
                <th>Chi / Nhánh</th>
                <th>Nghề nghiệp</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} onClick={() => onSelectMember(m.id)}>
                  <td>
                    <div className="member-cell-info">
                      <GenderAvatar
                        avatarUrl={m.avatarUrl}
                        gender={m.gender}
                        name={m.fullName}
                        size={32}
                        imgClassName="member-avatar-mini"
                      />
                      <div>
                        <div className="member-name-bold">{m.fullName}</div>
                        {m.otherName && <div className="member-other-name">({m.otherName})</div>}
                      </div>
                    </div>
                  </td>
                  <td>{m.gender === 'male' ? 'Nam ' : 'Nữ '}</td>
                  <td>
                    <span className="member-generation-text">Đời {m.generation}</span>
                  </td>
                  <td>{m.branch || 'Chưa xếp chi'}</td>
                  <td>{m.occupation || '—'}</td>
                  <td>
                    {m.isAlive ? (
                      <span className="member-badge-alive">Còn sống</span>
                    ) : (
                      <span className="member-badge-deceased">Đã mất</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMember(m.id);
                      }}
                      className="member-view-profile-btn"
                    >
                      Xem hồ sơ ➔
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default MemberList;
