import React, { useEffect, useState } from 'react';
import { fetchFamilyNetwork } from '../../../services/network.service';
import type { FamilyNetwork } from '../../../types/network';
import { FamilyClanCard } from '../FamilyClanCard';
import { EmptyState } from '../../../shared/Feedback/EmptyState';
import { LoadingState } from '../../../shared/Feedback/LoadingState';
import '../Network.css';

export const FamilyMaternalTab: React.FC = () => {
  const [families, setFamilies] = useState<FamilyNetwork[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFamilyNetwork('ngoai').then((data) => {
      setFamilies(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="network-layout">
        <div className="network-card">
          <LoadingState
            message="Đang đồng bộ mạng lưới Dòng họ liên kết & Thông gia..."
            subMessage="Hệ thống đang truy vấn các dòng họ ngoại tộc có mối quan hệ hôn nhân với gia tộc bạn."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="network-layout">
      <div className="network-card">
        <h3 className="network-card-title">Dòng Họ Liên Kết & Thông Gia</h3>
        <p className="network-card-subtitle">
          Các dòng họ kết nối thông gia, ngoại tộc qua quan hệ hôn nhân với dòng họ của bạn.
        </p>
        {families.length > 0 ? (
          <div className="network-clans-list">
            {families.map((f) => (
              <FamilyClanCard key={f.id} family={f} defaultExpanded={families.length === 1} />
            ))}
          </div>
        ) : (
          <EmptyState
            variant="requests"
            title="Chưa ghi nhận dòng họ liên kết hoặc thông gia"
            subMessage="Hệ thống chưa tìm thấy dữ liệu liên kết nào giữa dòng họ của bạn và các dòng họ đối tác trong cơ sở dữ liệu."
          />
        )}
      </div>
    </div>
  );
};

export default FamilyMaternalTab;
