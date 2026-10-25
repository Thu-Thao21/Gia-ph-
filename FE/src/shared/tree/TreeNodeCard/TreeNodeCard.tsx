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
      className={`tree-couple-container ${node.isFocusPerson ? 'is-focus-group' : ''}`}
    >
      {/* Primary Person Card (Blood Child / Direct Lineage) */}
      <div
        className={`tree-person-card ${node.gender} ${node.isFocusPerson ? 'is-focus-card' : ''}`}
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
          node.isFocusPerson
            ? `Click vào ${node.fullName} để thoát khỏi người làm trung tâm (hiện lại cây bình thường)`
            : `Click vào ${node.fullName} để chọn làm người trung tâm gia phả`
        }
      >
        <div className={`tree-person-gen-badge ${node.isFocusPerson ? 'is-focus-badge' : ''}`}>
          {`ĐỜI ${node.generation || 1}`}
          <span className={`tree-role-tag primary ${node.isFocusPerson ? 'role-focus' : ''}`}>
            {node.isFocusPerson ? 'Đang chọn' : (node.focusRole || getRoleTag(node.generation, node.gender, false))}
          </span>
        </div>

        <div className={`tree-person-avatar-wrap ${node.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
          {renderAvatar(node.fullName, node.gender, node.avatarUrl)}
        </div>
        
        <div className="tree-person-name">{node.fullName}</div>
        
        <div className={`tree-person-year ${node.isAlive === false ? 'deceased' : ''}`}>
          {getYearRange(node.birthDate, node.isAlive)}
        </div>

        {node.occupation && (
          <div className="tree-person-occupation" title={node.occupation}>
            {node.occupation}
          </div>
        )}
      </div>

      {/* Spouse Card with Explicit Gradient Connecting Line */}
      {primarySpouse && (
        <>
          <div className="tree-spouse-connector">
            <div className="tree-spouse-line" />
            <span className="tree-spouse-badge">
              {primarySpouse.focusRole || (primarySpouse.gender === 'female' ? 'Vợ' : 'Chồng')}
            </span>
          </div>

          <div
            className={`tree-person-card ${primarySpouse.gender} ${node.isFocusPerson ? 'is-focus-spouse' : ''}`}
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
              <span className="tree-role-tag spouse">
                {primarySpouse.focusRole || getRoleTag(node.generation, primarySpouse.gender, true)}
              </span>
            </div>

            <div className={`tree-person-avatar-wrap ${primarySpouse.gender === 'male' ? 'male-avatar' : 'female-avatar'}`}>
              {renderAvatar(primarySpouse.fullName, primarySpouse.gender, primarySpouse.avatarUrl)}
            </div>
            
            <div className="tree-person-name">{primarySpouse.fullName}</div>

            <div className={`tree-person-year ${primarySpouse.isAlive === false ? 'deceased' : ''}`}>
              {getYearRange(primarySpouse.birthDate, primarySpouse.isAlive)}
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
