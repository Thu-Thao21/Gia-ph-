import React, { useEffect, useState } from 'react';
import type { DualLineageResponse } from '../../../types/network';
import { fetchDualLineage } from '../../../services/network.service';
import './DualLineageModal.css';

export interface DualLineageModalProps {
  personId: string;
  onClose: () => void;
  onOpenHybridTree?: (linkId: string) => void;
}

export const DualLineageModal: React.FC<DualLineageModalProps> = ({
  personId,
  onClose,
  onOpenHybridTree,
}) => {
  const [data, setData] = useState<DualLineageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchDualLineage(personId)
      .then((res) => {
        if (!isMounted) return;
        if (res) {
          setData(res);
        } else {
          setError('Không thể tải sơ đồ huyết thống của thành viên này.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load dual lineage:', err);
        setError('Đã xảy ra lỗi khi truy vấn phả hệ Nội - Ngoại.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [personId]);

  return (
    <div className="dlm-backdrop" onClick={onClose}>
      <div className="dlm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dlm-header">
          <div>
            <h3 className="dlm-header-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Sơ đồ Huyết Thống Liên Họ: 2-3 Đời Bên Nội & Bên Ngoại
            </h3>
            <div className="dlm-header-sub">
              Trực quan hóa cội nguồn hai bên gia tộc qua mối quan hệ hôn nhân liên kết
            </div>
          </div>
          <button type="button" className="dlm-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="dlm-body">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Đang đồng bộ và truy vấn phả hệ Bên Nội và Bên Ngoại...
            </div>
          ) : error || !data ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#dc2626' }}>
              {error || 'Chưa tìm thấy dữ liệu phả hệ.'}
            </div>
          ) : (
            <>
              {/* Central Couple Hero Banner */}
              <div className="dlm-hero-banner">
                <div className="dlm-hero-person">
                  <div className={`dlm-hero-avatar ${data.person.gender === 'female' ? 'female' : 'male'}`}>
                    {data.person.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="dlm-hero-name">{data.person.fullName}</div>
                    <div className="dlm-hero-clan">{data.person.clanName} (Đời thứ {data.person.generation || 1})</div>
                  </div>
                </div>

                <div className="dlm-hero-bridge-icon">
                  <span className="dlm-bridge-pill">
                    {data.spouseBridge ? 'Hôn phối liên họ' : 'Huyết thống'}
                  </span>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" style={{ marginTop: '4px' }}>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>

                {data.spouseBridge ? (
                  <div className="dlm-hero-person">
                    <div className={`dlm-hero-avatar ${data.spouseBridge.partnerGender === 'female' ? 'female' : 'male'}`}>
                      {data.spouseBridge.partnerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="dlm-hero-name">{data.spouseBridge.partnerName}</div>
                      <div className="dlm-hero-clan">{data.spouseBridge.partnerClanName} (Phối ngẫu)</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Truy vấn từ thân phụ & thân mẫu
                  </div>
                )}
              </div>

              {/* Two Columns: Paternal Side vs Maternal Side */}
              <div className="dlm-columns">
                {/* Paternal Column */}
                <div className="dlm-column paternal">
                  <div className="dlm-column-header">
                    <h4 className="dlm-column-title">Gia Tộc Bên Nội</h4>
                    <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>
                      {data.paternalSide.clanName}
                    </span>
                  </div>

                  {data.paternalSide.generations.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Chưa ghi nhận thông tin tiền nhân bên Nội.
                    </div>
                  ) : (
                    data.paternalSide.generations.map((g) => (
                      <div key={g.level} className="dlm-gen-card">
                        <div className="dlm-gen-title">
                          Đời {g.level}: {g.title}
                        </div>
                        <div className="dlm-members-grid">
                          {g.members.map((m) => (
                            <div key={m.id} className="dlm-member-row">
                              <div>
                                <span className="dlm-member-name">{m.fullName}</span>
                                <span style={{ fontSize: '11.5px', color: '#64748b', marginLeft: '6px' }}>
                                  ({m.clanName})
                                </span>
                              </div>
                              <span className={`dlm-member-tag ${m.gender === 'female' ? 'female' : 'male'}`}>
                                {m.gender === 'female' ? 'Nữ' : 'Nam'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Maternal Column */}
                <div className="dlm-column maternal">
                  <div className="dlm-column-header">
                    <h4 className="dlm-column-title">Gia Tộc Bên Ngoại</h4>
                    <span style={{ fontSize: '12px', color: '#9d174d', fontWeight: 600 }}>
                      {data.maternalSide.clanName}
                    </span>
                  </div>

                  {data.maternalSide.generations.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Chưa ghi nhận thông tin tiền nhân bên Ngoại.
                    </div>
                  ) : (
                    data.maternalSide.generations.map((g) => (
                      <div key={g.level} className="dlm-gen-card">
                        <div className="dlm-gen-title">
                          Đời {g.level}: {g.title}
                        </div>
                        <div className="dlm-members-grid">
                          {g.members.map((m) => (
                            <div key={m.id} className="dlm-member-row">
                              <div>
                                <span className="dlm-member-name">{m.fullName}</span>
                                <span style={{ fontSize: '11.5px', color: '#64748b', marginLeft: '6px' }}>
                                  ({m.clanName})
                                </span>
                              </div>
                              <span className={`dlm-member-tag ${m.gender === 'female' ? 'female' : 'male'}`}>
                                {m.gender === 'female' ? 'Nữ' : 'Nam'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dlm-footer">
          {data?.spouseBridge?.linkId && onOpenHybridTree && (
            <button
              type="button"
              className="dlm-btn-primary"
              onClick={() => {
                const linkId = data.spouseBridge!.linkId;
                onClose();
                onOpenHybridTree(linkId);
              }}
            >
              Mở cây gia phả liên họ hoàn chỉnh
            </button>
          )}
          <button type="button" className="dlm-btn-secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default DualLineageModal;

