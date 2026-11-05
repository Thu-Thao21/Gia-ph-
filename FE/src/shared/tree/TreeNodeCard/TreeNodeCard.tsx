import React from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import { GenderAvatar } from '../../../components/common/GenderAvatar';
import './TreeNodeCard.css';

export interface TreeNodeCardProps {
  node: ErgoTreeNode;
  onCardClick: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (e: React.MouseEvent, node: ErgoTreeNode) => void;
}

export const TreeNodeCard: React.FC<TreeNodeCardProps> = ({
  node,
  onCardClick,
  onContextMenu,
  hasChildren = false,
  isExpanded = true,
  onToggleExpand,
}) => {
  const primarySpouse = node.spouses && node.spouses.length > 0 ? node.spouses[0] : null;

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
            : node.isFocusPerson
            ? `Click vào ${node.fullName} để thoát khỏi người làm trung tâm (hiện lại cây bình thường)`
            : `Click vào ${node.fullName} để chọn làm người trung tâm gia phả`
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
              {node.isFocusPerson ? 'Đang chọn' : (node.focusRole || getRoleTag(node.generation, node.gender, false))}
            </span>
          </div>
        )}

        <div className={`tree-person-avatar-wrap ${node.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
          {renderAvatar(node.fullName, node.gender, node.avatarUrl)}
        </div>
        
        <div className="tree-person-name">{node.fullName}</div>
        
        <div className={`tree-person-year ${node.isAlive === false ? 'deceased' : ''}`}>
          {getYearRange(node.birthDate, node.isAlive)}
        </div>

        {/* Trạng thái liên kết tài khoản người dùng */}
        <div
          className={`tree-person-account-badge ${node.userId ? 'is-linked' : 'is-unlinked'}`}
          title={node.userId ? 'Hồ sơ đã được liên kết với tài khoản người dùng' : 'Hồ sơ chưa liên kết tài khoản (hồ sơ phả hệ)'}
        >
          {node.userId ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>{node.isCurrentUser ? 'Chính bạn (Đã liên kết)' : 'Đã liên kết tài khoản'}</span>
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              <span>Chưa liên kết tài khoản</span>
            </>
          )}
        </div>

        {node.isUnconnected ? (
          <div className="tree-unconnected-indicator" title="Nhấp chuột phải để xác nhận mối quan hệ hoặc nối phả hệ">
            Chờ xác nhận quan hệ
          </div>
        ) : (
          node.occupation && (
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
              {primarySpouse.inLawRole || primarySpouse.focusRole || (primarySpouse.gender === 'female' ? 'Vợ' : 'Chồng')}
            </span>
          </div>

          <div
            className={`tree-person-card ${primarySpouse.gender} ${node.isFocusPerson ? 'is-focus-spouse' : ''} ${primarySpouse.isCurrentUser ? 'is-current-user' : ''}`}
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
              node.isFocusPerson
                ? `Click để thoát khỏi người làm trung tâm (hiện lại cây bình thường)`
                : `Click vào ${primarySpouse.fullName} để chọn làm người trung tâm gia phả`
            }
          >
            <div className="tree-person-gen-badge spouse">
              {`ĐỜI ${node.generation || 1}`}
              <span className={`tree-role-tag spouse ${primarySpouse.isCrossClan ? 'role-cross-clan' : ''}`}>
                {primarySpouse.inLawRole || primarySpouse.focusRole || getRoleTag(node.generation, primarySpouse.gender, true)}
              </span>
            </div>

            <div className={`tree-person-avatar-wrap ${primarySpouse.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
              {renderAvatar(primarySpouse.fullName, primarySpouse.gender, primarySpouse.avatarUrl)}
            </div>
            
            <div className="tree-person-name">{primarySpouse.fullName}</div>

            {primarySpouse.isCrossClan && (
              <div
                style={{
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: '#6d28d9',
                  marginTop: '2px',
                  textAlign: 'center',
                }}
                title={`Mối quan hệ thông gia liên tộc: ${primarySpouse.inLawRole}`}
              >
                {primarySpouse.inLawRole}
              </div>
            )}

            <div className={`tree-person-year ${primarySpouse.isAlive === false ? 'deceased' : ''}`}>
              {getYearRange(primarySpouse.birthDate, primarySpouse.isAlive)}
            </div>

            {/* Trạng thái liên kết tài khoản người dùng (Spouse) */}
            <div
              className={`tree-person-account-badge ${primarySpouse.userId ? 'is-linked' : 'is-unlinked'}`}
              title={primarySpouse.userId ? 'Hồ sơ đã được liên kết với tài khoản người dùng' : 'Hồ sơ chưa liên kết tài khoản (hồ sơ phả hệ)'}
            >
              {primarySpouse.userId ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span>{primarySpouse.isCurrentUser ? 'Chính bạn (Đã liên kết)' : 'Đã liên kết tài khoản'}</span>
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  <span>Chưa liên kết tài khoản</span>
                </>
              )}
            </div>

            {primarySpouse.occupation && (
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
          className={`tree-node-toggle-btn ${!isExpanded ? 'collapsed' : ''}`}
          data-toggle-btn-id={node.id}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(e, node);
          }}
          title={isExpanded ? 'Thu gọn nhánh con' : 'Mở rộng nhánh con'}
        >
          {isExpanded ? `▲ ${node.children.length} con` : `▼ ${node.children.length} con`}
        </button>
      )}
    </div>
  );
};

export default TreeNodeCard;
