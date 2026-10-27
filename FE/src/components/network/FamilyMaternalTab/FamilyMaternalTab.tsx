import React, { useEffect, useState } from 'react';
import { fetchFamilyNetwork } from '../../../services/network.service';
import type { FamilyNetwork } from '../../../types/network';
import { FamilyClanCard } from '../FamilyClanCard';
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

  if (loading) return <div className="network-loading-prompt">Đang tải dữ liệu Dòng họ Ngoại...</div>;

  return (
    <div className="network-layout">
      <div className="network-card">
        <h3 className="network-card-title">Dòng Họ Ngoại (Bên Mẹ)</h3>
        <p className="network-card-subtitle">
          Các dòng họ thuộc bên ngoại mẹ, gắn kết qua quan hệ hôn nhân với dòng họ Nội.
        </p>
        {families.length > 0 ? (
          <div className="network-clans-list">
            {families.map((f) => (
              <FamilyClanCard key={f.id} family={f} defaultExpanded={families.length === 1} />
            ))}
          </div>
        ) : (
          <div className="network-empty">Chưa có dữ liệu dòng họ Ngoại nào trong cơ sở dữ liệu.</div>
        )}
      </div>
    </div>
  );
};

export default FamilyMaternalTab;
