import React, { useState } from 'react';
import type { FamilyNetwork, NetworkMemberItem } from '../../types/network';

interface FamilyClanCardProps {
  family: FamilyNetwork;
  defaultExpanded?: boolean;
}

export const FamilyClanCard: React.FC<FamilyClanCardProps> = ({ family, defaultExpanded = false }) => {
  const [showAllMembers, setShowAllMembers] = useState(defaultExpanded);
  const [searchMember, setSearchMember] = useState('');

  const allMembers: NetworkMemberItem[] = family.members || [];

  const filteredMembers = allMembers.filter((m) => {
    if (!searchMember.trim()) return true;
    const query = searchMember.toLowerCase();
    return (
      m.fullName.toLowerCase().includes(query) ||
      `đời ${m.generation}`.toLowerCase().includes(query) ||
      m.gender.toLowerCase().includes(query) ||
      (m.branch && m.branch.toLowerCase().includes(query))
    );
  });

  const displayedMembers = showAllMembers ? filteredMembers : filteredMembers.slice(0, 5);

  return (
    <div className="network-clan-card">
      <div className="network-clan-card-header">
        <div className="network-clan-header-top">
          <div className="network-clan-title-group">
            <h4 className="network-clan-name">{family.name}</h4>
            {family.code && <span className="network-clan-code">{family.code}</span>}
          </div>
          <div className="network-clan-badges">
            <span className={`network-clan-tag ${family.category === 'ngoai' ? 'tag-maternal' : 'tag-paternal'}`}>
              {family.category === 'ngoai' ? 'Bên ngoại' : 'Bên nội'}
            </span>
            <span className="network-clan-tag tag-connected">
              {family.status === 'connected' ? 'Đã kết nối' : 'Đang hoạt động'}
            </span>
          </div>
        </div>

        <div className="network-clan-info-grid">
          <div className="network-clan-info-item">
            <span className="info-label">Thủy tổ:</span>
            <span className="info-value highlight">{family.founderName || 'Chưa cập nhật'}</span>
          </div>
          <div className="network-clan-info-item">
            <span className="info-label">Quê quán:</span>
            <span className="info-value">{family.originPlace || 'Chưa rõ quê quán'}</span>
          </div>
          {family.ancestralHouseAddress && (
            <div className="network-clan-info-item full-width">
              <span className="info-label">Từ đường:</span>
              <span className="info-value">{family.ancestralHouseAddress}</span>
            </div>
          )}
        </div>

        <p className="network-clan-history">{family.history || 'Chưa có thông tin lịch sử dòng họ.'}</p>

        <div className="network-clan-meta-row">
          <span className="network-meta-pill count-pill">
            <strong>{family.memberCount}</strong> thành viên
          </span>
          <span className="network-meta-pill place-pill">{family.originPlace || 'Chưa rõ quê quán'}</span>
          {family.branches &&
            family.branches.map((b, i) => (
              <span key={i} className="network-meta-pill branch-pill">
                {b}
              </span>
            ))}
        </div>
      </div>

      {/* MEMBER LIST SECTION */}
      <div className="network-clan-members-section">
        <div className="network-members-header">
          <div className="network-members-title">
            <span>Danh sách thành viên dòng tộc</span>
            <span className="network-members-counter">({allMembers.length})</span>
          </div>

          {allMembers.length > 5 && (
            <div className="network-members-search-wrap">
              <input
                type="text"
                placeholder="Tìm thành viên, đời..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                className="network-member-search-input"
              />
            </div>
          )}
        </div>

        {allMembers.length === 0 ? (
          <div className="network-members-empty">Chưa có thông tin thành viên nào trong dòng họ này.</div>
        ) : filteredMembers.length === 0 ? (
          <div className="network-members-empty">Không tìm thấy thành viên nào phù hợp với "{searchMember}".</div>
        ) : (
          <div className="network-members-table-wrap">
            <table className="network-members-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Họ và tên</th>
                  <th style={{ width: '15%' }}>Đời</th>
                  <th style={{ width: '15%' }}>Giới tính</th>
                  <th style={{ width: '20%' }}>Ngày sinh</th>
                  <th style={{ width: '20%' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {displayedMembers.map((member) => (
                  <tr key={member.id} className="network-member-row">
                    <td>
                      <div className="member-name-cell">
                        <span className={`member-avatar-badge ${member.gender === 'Nữ' ? 'female' : 'male'}`}>
                          {member.fullName.charAt(0).toUpperCase()}
                        </span>
                        <div className="member-name-text">
                          <span className="member-full-name">{member.fullName}</span>
                          {member.branch && member.branch !== 'Nhánh chính' && (
                            <span className="member-branch-text">{member.branch}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`gen-pill gen-${member.generation}`}>Đời {member.generation}</span>
                    </td>
                    <td>
                      <span className={`gender-text ${member.gender === 'Nữ' ? 'female' : 'male'}`}>
                        {member.gender}
                      </span>
                    </td>
                    <td>
                      <span className="birth-date-text">{member.birthDate || 'Chưa rõ'}</span>
                    </td>
                    <td>
                      <span className={`living-badge ${member.isAlive ? 'alive' : 'deceased'}`}>
                        {member.isAlive ? 'Còn sống' : 'Đã mất'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredMembers.length > 5 && !searchMember && (
          <div className="network-members-toggle-row">
            <button
              type="button"
              className="btn-toggle-members"
              onClick={() => setShowAllMembers(!showAllMembers)}
            >
              {showAllMembers
                ? 'Thu gọn danh sách'
                : `Xem tất cả ${filteredMembers.length} thành viên (${filteredMembers.length - 5} thành viên khác)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
