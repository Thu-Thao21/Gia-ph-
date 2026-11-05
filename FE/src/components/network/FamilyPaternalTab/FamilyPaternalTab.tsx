import React, { useEffect, useState } from 'react';
import { fetchFamilyNetwork } from '../../../services/network.service';
import type { FamilyNetwork } from '../../../types/network';
import { FamilyClanCard } from '../FamilyClanCard';
import { EmptyState } from '../../../shared/Feedback/EmptyState';
import { LoadingState } from '../../../shared/Feedback/LoadingState';
import '../Network.css';

export const FamilyPaternalTab: React.FC = () => {
  const [families, setFamilies] = useState<FamilyNetwork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFamilyNetwork('noi').then((data) => {
      setFamilies(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="network-layout">
        <div className="network-card">
          <LoadingState
            message="Đang đồng bộ dữ liệu Dòng họ Nội tộc..."
            subMessage="Hệ thống đang truy vấn các chi phái và trực hệ nội tộc từ cơ sở dữ liệu."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="network-layout">
      <div className="network-card">
        <h3 className="network-card-title">Dòng Họ Nội Tộc</h3>
        <p className="network-card-subtitle">
          Dòng họ chính và các chi nhánh trực hệ trong gia phả của bạn.
        </p>
        {families.length > 0 ? (
          <div className="network-clans-list">
            {families.map((f) => (
              <FamilyClanCard key={f.id} family={f} defaultExpanded={families.length === 1} />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="tree"
            title="Chưa ghi nhận dữ liệu Dòng họ Nội tộc"
            subMessage="Hệ thống chưa tìm thấy thông tin chi phái trực hệ nội tộc nào trong cơ sở dữ liệu gia tộc."
          />
        )}
      </div>
    </div>
  );
};

export default FamilyPaternalTab;
