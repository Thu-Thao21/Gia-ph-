import React, { useEffect, useState } from 'react';
import { fetchFamilyNetwork, fetchInLawMarriages } from '../../../services/network.service';
import type { FamilyNetwork } from '../../../types/network';
import '../Network.css';
import './NetworkOverview.css';
import { NetworkTopologyDiagram } from '../NetworkTopologyDiagram';

export interface NetworkOverviewProps {
  onSelectTab?: (tab: string) => void;
}

export const NetworkOverview: React.FC<NetworkOverviewProps> = ({ onSelectTab }) => {
  const [allFamilies, setAllFamilies] = useState<FamilyNetwork[]>([]);
  const [inLawCount, setInLawCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'diagram' | 'grid'>('diagram');

  useEffect(() => {
    Promise.all([fetchFamilyNetwork('all'), fetchInLawMarriages()]).then(([families, marriages]) => {
      setAllFamilies(families);
      setInLawCount(marriages.length);
      setLoading(false);
    });
  }, []);

  const noiFamilies = allFamilies.filter((f) => f.category === 'noi');
  const ngoaiFamilies = allFamilies.filter((f) => f.category === 'ngoai');
  const thongGiaFamilies = allFamilies.filter((f) => f.category === 'thong-gia');
  const totalMembers = allFamilies.reduce((sum, f) => sum + f.memberCount, 0);

  if (loading) {
    return <div className="network-loading-prompt">Đang tải mạng lưới liên họ...</div>;
  }

  return (
    <div className="network-layout">
      <div className="network-overview-banner">
        <h1 className="network-overview-title">Mạng Lưới Liên Họ</h1>
        <p className="network-overview-desc">
          Quản lý kết nối giữa các dòng họ Nội, Ngoại, Dâu Rể và Thông gia trong hệ thống gia phả đa dòng họ.
        </p>

        <div className="network-stats-row">
          <div className="network-stat-card interactive" onClick={() => onSelectTab?.('net-noi')}>
            <div className="network-stat-number">{noiFamilies.length}</div>
            <div className="network-stat-label">Dòng họ Nội</div>
          </div>
          <div className="network-stat-card interactive" onClick={() => onSelectTab?.('net-ngoai')}>
            <div className="network-stat-number">{ngoaiFamilies.length}</div>
            <div className="network-stat-label">Dòng họ Ngoại</div>
          </div>
          <div className="network-stat-card interactive" onClick={() => onSelectTab?.('net-dau-re')}>
            <div className="network-stat-number">{inLawCount}</div>
            <div className="network-stat-label">Dâu & Rể liên họ</div>
          </div>
          <div className="network-stat-card interactive" onClick={() => onSelectTab?.('net-thong-gia')}>
            <div className="network-stat-number">{thongGiaFamilies.length}</div>
            <div className="network-stat-label">Họ Thông gia</div>
          </div>
          <div className="network-stat-card">
            <div className="network-stat-number">{totalMembers}</div>
            <div className="network-stat-label">Tổng thành viên</div>
          </div>
        </div>
      </div>

      <div className="network-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 className="network-card-title" style={{ margin: 0 }}>Cấu Trúc Mạng Lưới Dòng Tộc</h3>
          <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              className={`ntd-filter-btn ${viewMode === 'diagram' ? 'active' : ''}`}
              onClick={() => setViewMode('diagram')}
            >
              Sơ đồ mạng lưới trực quan
            </button>
            <button
              type="button"
              className={`ntd-filter-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
            >
              Danh sách dòng họ ({allFamilies.length})
            </button>
          </div>
        </div>

        {viewMode === 'diagram' ? (
          <NetworkTopologyDiagram />
        ) : (
          <div className="network-family-grid">
          {allFamilies.map((f) => (
            <div key={f.id} className="network-family-card">
              <div className="network-family-name">{f.name}</div>
              <div className="network-family-founder">Khai tổ: {f.founderName || 'Chưa rõ'} • {f.originPlace || ''}</div>
              <div className="network-family-meta">
                <span className="network-meta-chip">{f.memberCount} thành viên</span>
                <span className={`network-meta-chip ${f.category === 'noi' ? 'green' : f.category === 'ngoai' ? 'purple' : 'amber'}`}>
                  {f.category === 'noi' ? 'Họ Nội' : f.category === 'ngoai' ? 'Họ Ngoại' : 'Thông gia'}
                </span>
                {f.branches.length > 0 && <span className="network-meta-chip">{f.branches.length} chi</span>}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};

export default NetworkOverview;
