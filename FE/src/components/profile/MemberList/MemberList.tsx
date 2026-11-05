import { EmptyState } from '../../../shared/Feedback/EmptyState';
import { LoadingState } from '../../../shared/Feedback/LoadingState';
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
          <LoadingState
            message="Đang đồng bộ danh sách nhân khẩu gia tộc..."
            subMessage="Hệ thống đang truy xuất thông tin thành viên từ cơ sở dữ liệu phả hệ."
          />
        ) : members.length === 0 ? (
          <EmptyState
            variant="members"
            title="Không tìm thấy thành viên phù hợp"
            subMessage={searchTerm ? `Không tìm thấy hồ sơ nào khớp với từ khóa "${searchTerm}". Vui lòng thử tìm kiếm bằng từ khóa khác.` : "Dòng họ hiện chưa có hồ sơ thành viên nào được lưu trữ."}
          />
        ) : (
          <table className="member-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Giới tính</th>
                <th>Thế hệ</th>
                <th>Chi / Nhánh</th>
                <th>Nghề nghiệp</th>
                <th>Trạng thái hồ sơ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} onClick={() => onSelectMember(m.id)} style={{ cursor: 'pointer' }}>
                  <td className="member-name-cell">
                    <GenderAvatar gender={m.gender} fullName={m.fullName} avatarUrl={m.avatarUrl} size={36} />
                    <div className="member-name-info">
                      <span className="member-primary-name">{m.fullName}</span>
                      {m.otherName && <span className="member-secondary-name">({m.otherName})</span>}
                    </div>
                  </td>
                  <td>{m.gender === 'male' ? 'Nam' : 'Nữ'}</td>
                  <td>
                    <span className="member-badge-generation">Đời thứ {m.generation}</span>
                  </td>
                  <td>{m.branch || 'Chưa xếp chi'}</td>
                  <td>{m.occupation || '—'}</td>
                  <td>
                    <div className="member-status-group">
                      {m.isAlive ? (
                        <span className="member-badge-alive">Còn sống</span>
                      ) : (
                        <span className="member-badge-deceased">Đã mất</span>
                      )}
                      {m.userId ? (
                        <span className="member-badge-account is-linked" title="Đã có tài khoản người dùng liên kết">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          Đã liên kết tài khoản
                        </span>
                      ) : (
                        <span className="member-badge-account is-unlinked" title="Hồ sơ phả hệ chưa có tài khoản liên kết (tượng trưng)">
                          Chưa liên kết tài khoản
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className="member-btn-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMember(m.id);
                      }}
                    >
                      Chi tiết →
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
