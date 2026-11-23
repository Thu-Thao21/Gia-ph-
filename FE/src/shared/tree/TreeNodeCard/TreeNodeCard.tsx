import React from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { GenealogyChartConfig } from '../GenealogyChartStudio/chartConfigTypes';
import { GenderAvatar } from '../../../components/common/GenderAvatar';
import './TreeNodeCard.css';

export interface TreeNodeCardProps {
  node: ErgoTreeNode;
  onCardClick: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onViewInLawTree?: (clanId: string, personId: string) => void;
  isInLawExpanded?: boolean;
  onToggleInLawExpand?: (personId: string) => void;
  onViewBurial?: (node: ErgoTreeNode) => void;
  chartConfig?: GenealogyChartConfig;
}

const GEN_COLORS = [
  { border: '#b45309', bg: '#fef3c7', text: '#78350f', badge: '#d97706' }, // Đời 1
  { border: '#c2410c', bg: '#ffedd5', text: '#7c2d12', badge: '#ea580c' }, // Đời 2
  { border: '#7e22ce', bg: '#f3e8ff', text: '#581c87', badge: '#9333ea' }, // Đời 3
  { border: '#2563eb', bg: '#dbeafe', text: '#1e3a8a', badge: '#3b82f6' }, // Đời 4
  { border: '#059669', bg: '#d1fae5', text: '#064e3b', badge: '#10b981' }, // Đời 5
  { border: '#db2777', bg: '#fce7f3', text: '#831843', badge: '#ec4899' }, // Đời 6
  { border: '#0891b2', bg: '#cffafe', text: '#155e75', badge: '#06b6d4' }, // Đời 7
  { border: '#ca8a04', bg: '#fef9c3', text: '#713f12', badge: '#eab308' }, // Đời 8
  { border: '#4f46e5', bg: '#e0e7ff', text: '#312e81', badge: '#6366f1' }, // Đời 9
  { border: '#0d9488', bg: '#ccfbf1', text: '#042f2e', badge: '#14b8a6' }, // Đời 10
  { border: '#e11d48', bg: '#ffe4e6', text: '#881337', badge: '#f43f5e' }, // Đời 11
  { border: '#475569', bg: '#f1f5f9', text: '#1e293b', badge: '#64748b' }, // Đời 12
  { border: '#52525b', bg: '#f4f4f5', text: '#27272a', badge: '#71717a' }, // Đời 13
  { border: '#6d28d9', bg: '#ede9fe', text: '#4c1d95', badge: '#7c3aed' }, // Đời 14
];

export const TreeNodeCard: React.FC<TreeNodeCardProps> = ({
  node,
  onCardClick,
  onContextMenu,
  hasChildren = false,
  isExpanded = true,
  onToggleExpand,
  onViewInLawTree,
  isInLawExpanded,
  onToggleInLawExpand,
  onViewBurial,
  chartConfig,
}) => {
  const showSpouses = chartConfig ? chartConfig.showSpouses !== false : true;
  const primarySpouse = showSpouses && node.spouses && node.spouses.length > 0 ? node.spouses[0] : null;

  const getCustomCardStyle = (isSpouse: boolean) => {
    if (!chartConfig) return undefined;
    if (chartConfig.cardColorMode === 'generation') {
      const idx = Math.max(0, ((node.generation || 1) - 1) % 14);
      const c = GEN_COLORS[idx];
      return {
        borderColor: isSpouse ? '#db2777' : c.border,
        boxShadow: `0 4px 14px ${isSpouse ? 'rgba(219, 39, 119, 0.12)' : 'rgba(180, 83, 9, 0.12)'}`,
      };
    } else if (chartConfig.cardColorMode === 'status') {
      const isAlive = isSpouse ? (primarySpouse?.isAlive !== false) : (node.isAlive !== false);
      return {
        borderColor: isAlive ? '#10b981' : '#b45309',
        boxShadow: `0 4px 14px ${isAlive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(180, 83, 9, 0.12)'}`,
      };
    } else if (chartConfig.cardColorMode === 'gender') {
      const isMale = (isSpouse ? primarySpouse?.gender : node.gender) === 'male';
      return {
        borderColor: isMale ? '#2563eb' : '#db2777',
      };
    }
    return undefined;
  };

  const renderAvatar = (fullName: string, gender: string, avatarUrl?: string) => {
    return (
      <GenderAvatar
        avatarUrl={avatarUrl}
        gender={gender}
        name={fullName}
        size={46}
        imgClassName="tree-person-avatar-img"
      />
    );
  };

  const getYearRange = (birthDate?: string, isAlive?: boolean) => {
    if (!birthDate) return '19XX';
    const year = birthDate.substring(0, 4);
    if (isAlive === false) {
      return `${year} (Đã mất)`;
    }
    return `${year}`;
  };

  const getRoleTag = (gen: number, gender: string, isSpouse: boolean) => {
    if (gen === 1) {
      if (isSpouse) {
        return gender === 'female' ? 'Cụ Bà' : 'Cụ Ông';
      }
      return gender === 'male' ? 'Thủy Tổ' : 'Cụ Bà';
    }
    if (isSpouse) {
      return gender === 'female' ? 'Con dâu' : 'Con rể';
    }
    return 'Con ruột';
  };

  return (
    <div
      className={`tree-couple-container ${node.isFocusPerson ? 'is-focus-group' : ''} ${hasChildren ? 'has-children' : ''}`}
    >
      {/* Primary Person Card (Blood Child / Direct Lineage) */}
      <div
        className={`tree-person-card ${node.gender} ${node.isFocusPerson ? 'is-focus-card' : ''} ${node.isUnconnected ? 'is-unconnected-card' : ''} ${node.isCurrentUser ? 'is-current-user' : ''}`}
        style={getCustomCardStyle(false)}
        data-person-card-id={node.id}
        onClick={(e) => {
          e.stopPropagation();
          onCardClick(e, node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, node);
        }}
        title={
          node.isUnconnected
            ? `${node.fullName} (Đã tham gia dòng họ, chưa nối đường quan hệ - Click chuột phải để nối phả hệ)`
            : node.isCurrentUser
            ? `Click vào chính bạn để mở/đóng mạng lưới phả hệ thông gia`
            : node.isFocusPerson
            ? `Click vào ${node.fullName} để thoát chế độ 4 đời (xem lại toàn bộ cây)`
            : `Click vào ${node.fullName} để lấy làm trung tâm hiện 4 đời`
        }
      >
        {node.isUnconnected ? (
          <div className="tree-person-gen-badge is-unconnected-badge">
            CHƯA NỐI PHẢ HỆ
            <span className="tree-role-tag role-unconnected">Chờ liên kết</span>
          </div>
        ) : (
          <div className={`tree-person-gen-badge ${node.isFocusPerson ? 'is-focus-badge' : ''}`}>
            {`ĐỜI ${node.generation || 1}`}
            <span className={`tree-role-tag primary ${node.isFocusPerson ? 'role-focus' : ''}`}>
              {node.isFocusPerson ? 'Tâm điểm 4 đời' : (node.focusRole || getRoleTag(node.generation, node.gender, false))}
            </span>
          </div>
        )}

        {chartConfig?.showAvatars !== false && (
          <div className={`tree-person-avatar-wrap ${node.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
            {renderAvatar(node.fullName, node.gender, node.avatarUrl)}
          </div>
        )}
        
        <div className="tree-person-name">{node.fullName}</div>
        
        {chartConfig?.showBirthDeath !== false && (
          <div className={`tree-person-year ${node.isAlive === false ? 'deceased' : ''}`}>
            {getYearRange(node.birthDate, node.isAlive)}
          </div>
        )}

        {/* Nút chỉ đường vị trí phần mộ Google Maps cho người đã khuất */}
        {node.isAlive === false && onViewBurial && (
          <button
            type="button"
            className="tree-person-burial-badge"
            title={`Xem vị trí mộ phần & chỉ đường Google Maps cho ${node.fullName}`}
            onClick={(e) => {
              e.stopPropagation();
              onViewBurial(node);
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>Vị trí mộ</span>
          </button>
        )}

        {/* Trạng thái liên kết tài khoản người dùng */}
        {(node.userId || node.isCurrentUser) && (
          <div
            className="tree-person-account-badge is-linked"
            title={node.isCurrentUser ? 'Chính tài khoản của bạn đang đăng nhập' : 'Hồ sơ đã được liên kết với tài khoản người dùng'}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>{node.isCurrentUser ? 'Chính bạn (Đã liên kết)' : 'Đã liên kết tài khoản'}</span>
          </div>
        )}

        {node.isUnconnected ? (
          <div className="tree-unconnected-indicator" title="Nhấp chuột phải để xác nhận mối quan hệ hoặc nối phả hệ">
            Chờ xác nhận quan hệ
          </div>
        ) : (
          chartConfig?.showOccupation !== false && node.occupation && (
            <div className="tree-person-occupation" title={node.occupation}>
              {node.occupation}
            </div>
          )
        )}
      </div>

      {/* Spouse Card with Explicit Gradient Connecting Line */}
      {primarySpouse && (
        <>
          <div className="tree-spouse-connector" data-spouse-bridge-id={node.id}>
            <div
              className="tree-spouse-line"
              style={primarySpouse.isCrossClan ? { background: 'linear-gradient(90deg, #2563eb, #7c3aed)' } : undefined}
            />
            <span
              className="tree-spouse-badge"
              style={primarySpouse.isCrossClan ? { background: '#f5f3ff', color: '#6d28d9', borderColor: '#c4b5fd' } : undefined}
            >
              {primarySpouse.gender === 'female' ? 'Vợ' : (primarySpouse.isCrossClan ? 'Rể' : 'Chồng')}
            </span>
          </div>

          <div
            className={`tree-person-card ${primarySpouse.gender} ${node.isFocusPerson ? 'is-focus-spouse' : ''} ${primarySpouse.isCurrentUser ? 'is-current-user' : ''}`}
            style={getCustomCardStyle(true)}
            data-person-card-id={primarySpouse.id}
            onClick={(e) => {
              e.stopPropagation();
              onCardClick(e, {
                ...node,
                id: primarySpouse.id,
                fullName: primarySpouse.fullName,
                gender: primarySpouse.gender,
                avatarUrl: primarySpouse.avatarUrl,
                birthDate: primarySpouse.birthDate,
                isAlive: primarySpouse.isAlive,
                occupation: primarySpouse.occupation,
                userId: primarySpouse.userId,
                isCurrentUser: primarySpouse.isCurrentUser,
              });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e, {
                ...node,
                id: primarySpouse.id,
                fullName: primarySpouse.fullName,
                gender: primarySpouse.gender,
                userId: primarySpouse.userId,
                isCurrentUser: primarySpouse.isCurrentUser,
              });
            }}
            title={
              primarySpouse.isCrossClan
                ? `${primarySpouse.fullName}${primarySpouse.clanName ? ` (${primarySpouse.clanName})` : ''} - Nhấp để xem gia phả liên họ 4 đời`
                : primarySpouse.clanName
                ? `${primarySpouse.fullName} (${primarySpouse.clanName})`
                : node.isFocusPerson
                ? `Click để thoát khỏi người làm trung tâm (hiện lại cây bình thường)`
                : `Click vào ${primarySpouse.fullName} để chọn làm người trung tâm gia phả`
            }
          >
            <div className="tree-person-gen-badge spouse">
              {`ĐỜI ${node.generation || 1}`}
              <span className="tree-role-tag spouse">
                {getRoleTag(node.generation, primarySpouse.gender, true)}
              </span>
            </div>

            {chartConfig?.showAvatars !== false && (
              <div className={`tree-person-avatar-wrap ${primarySpouse.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
                {renderAvatar(primarySpouse.fullName, primarySpouse.gender, primarySpouse.avatarUrl)}
              </div>
            )}
            
            <div className="tree-person-name">{primarySpouse.fullName}</div>

            {chartConfig?.showBirthDeath !== false && (
              <div className={`tree-person-year ${primarySpouse.isAlive === false ? 'deceased' : ''}`}>
                {getYearRange(primarySpouse.birthDate, primarySpouse.isAlive)}
              </div>
            )}

            {/* Nút chỉ đường vị trí phần mộ Google Maps cho phối ngẫu đã khuất */}
            {primarySpouse.isAlive === false && onViewBurial && (
              <button
                type="button"
                className="tree-person-burial-badge"
                title={`Xem vị trí mộ phần & chỉ đường Google Maps cho ${primarySpouse.fullName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewBurial({
                    ...node,
                    id: primarySpouse.id,
                    fullName: primarySpouse.fullName,
                    gender: primarySpouse.gender,
                    isAlive: false,
                  });
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>Vị trí mộ</span>
              </button>
            )}

            {/* Trạng thái liên kết tài khoản người dùng (Spouse) */}
            {(primarySpouse.userId || primarySpouse.isCurrentUser) && (
              <div
                className="tree-person-account-badge is-linked"
                title={primarySpouse.isCurrentUser ? 'Chính bạn (Đã liên kết)' : 'Hồ sơ đã được liên kết với tài khoản người dùng'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>{primarySpouse.isCurrentUser ? 'Chính bạn (Đã liên kết)' : 'Đã liên kết tài khoản'}</span>
              </div>
            )}

            {chartConfig?.showOccupation !== false && primarySpouse.occupation && (
              <div className="tree-person-occupation" title={primarySpouse.occupation}>
                {primarySpouse.occupation}
              </div>
            )}
          </div>
        </>
      )}

      {/* Toggle Expand/Collapse Button (Draws Stem Line Down to Children!) */}
      {hasChildren && onToggleExpand && (
        <button
          type="button"
          className={`tree-node-toggle-btn ${!isExpanded ? 'collapsed' : ''}`}
          data-toggle-btn-id={node.id}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpand(e, node);
          }}
          title={isExpanded ? `Thu gọn ${node.children.length} nhánh con` : `Mở rộng ${node.children.length} nhánh con`}
        >
          {isExpanded ? `▲ ${node.children.length} con` : `▼ ${node.children.length} con`}
        </button>
      )}
    </div>
  );
};

export default TreeNodeCard;
