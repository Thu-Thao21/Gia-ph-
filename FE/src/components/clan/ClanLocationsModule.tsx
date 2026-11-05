import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../../hooks/useAuth';
import { useClanContext } from '../../context/ClanContext';
import type { ClanLocation, LocationProposal, LocationType } from '../../types/location';
import {
  fetchClanLocations,
  deleteClanLocation,
  fetchLocationProposals,
  reviewLocationProposal,
  getGoogleMapsDirectionUrl,
} from '../../services/location.service';
import { ClanLocationEditModal } from './ClanLocationEditModal';
import './ClanLocationsModule.css';

export interface ClanLocationsModuleProps {
  clanId?: string;
  canManage?: boolean;
}

const typeLabels: Record<LocationType, string> = {
  ANCESTRAL_HALL: 'Nhà thờ đại tộc',
  BRANCH_HALL: 'Từ đường chi phái',
  HISTORIC_SITE: 'Di tích lịch sử',
  EVENT_VENUE: 'Nơi tổ chức sự kiện',
  HOMELAND: 'Đất tổ quê hương',
  OTHER: 'Địa điểm khác',
};

function createMarkerIcon(isMain = false) {
  return L.divIcon({
    className: 'clan-marker-pin',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${isMain ? '#2563eb' : '#059669'};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 2px solid #ffffff;
      ">
        <div style="
          width: 10px;
          height: 10px;
          background: #ffffff;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export const ClanLocationsModule: React.FC<ClanLocationsModuleProps> = ({ clanId, canManage: propCanManage }) => {
  const { account, primaryRole } = useAuth();
  const {
    activeClanId,
    activeClanRole,
    activeClanRoleLabel,
    activeMembership,
    activeClanPermissions,
  } = useClanContext();
  const effectiveClanId = clanId || activeClanId || '3705a0e2-7eb4-4eaa-89ed-a92b4e7613e4';

  const [locations, setLocations] = useState<ClanLocation[]>([]);
  const [proposals, setProposals] = useState<LocationProposal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'map' | 'proposals'>('map');
  const [editModalData, setEditModalData] = useState<ClanLocation | null | undefined>(undefined);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  // Quyền quản trị địa điểm dòng họ:
  // 1. Nếu prop canManage được truyền từ cha (Dashboard / FamilyAdminModule)
  // 2. Quản trị hệ thống (admin / system_admin)
  // 3. Trưởng tộc hoặc Family Admin của dòng họ đang chọn (theo activeClanRole hoặc activeMembership)
  // 4. Có quyền family.update / branch.manage trong dòng họ
  // 5. Hoặc khi đang ở giao diện quản trị dòng họ (/clan-admin)
  const isSysAdmin = primaryRole === 'admin' || (account?.primary_role || '').toLowerCase() === 'admin';
  const isClanAdmin =
    activeClanRole === 'clan_admin' ||
    activeClanRoleLabel === 'Trưởng tộc' ||
    (activeMembership?.roles || []).some((r) =>
      ['BUSINESS_OWNER', 'CLAN_ADMIN', 'OWNER', 'FAMILY_HEAD'].includes(r.toUpperCase())
    ) ||
    (account?.roles || []).some((r) =>
      ['BUSINESS_OWNER', 'CLAN_ADMIN', 'SYSTEM_ADMIN'].includes((r.role || '').toUpperCase())
    );
  const isFamilyAdmin =
    activeClanRole === 'family_admin' ||
    activeClanRoleLabel === 'Family Admin' ||
    (activeMembership?.roles || []).some((r) => ['FAMILY_ADMIN'].includes(r.toUpperCase()));

  const hasPerm = (activeClanPermissions || []).some((p) =>
    ['family.update', 'branch.manage', 'location.manage'].includes(p)
  );

  const isClanAdminRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/clan-admin');

  const canManage =
    propCanManage === true ||
    isClanAdminRoute ||
    isSysAdmin ||
    isClanAdmin ||
    isFamilyAdmin ||
    hasPerm;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadData = async () => {
    if (!effectiveClanId) return;
    setLoading(true);
    try {
      const [locs, props] = await Promise.all([
        fetchClanLocations(effectiveClanId),
        fetchLocationProposals(effectiveClanId),
      ]);
      setLocations(locs);
      setProposals(props);
    } catch (err) {
      console.error('Lỗi tải dữ liệu địa điểm:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveClanId]);

  // Leaflet Map Initialization & Markers
  useEffect(() => {
    if (activeTab !== 'map' || !mapContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const defaultCenter = locations.length > 0
          ? [locations[0].latitude, locations[0].longitude] as [number, number]
          : [15.8893, 108.2392] as [number, number];

        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: 13,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const map = mapInstanceRef.current;
      if (!map) return;

      // Add markers for all locations
      const latLngBounds: [number, number][] = [];

      locations.forEach((loc) => {
        if (!loc.latitude || !loc.longitude) return;

        latLngBounds.push([loc.latitude, loc.longitude]);

        const isMain = loc.locationType === 'ANCESTRAL_HALL';
        const marker = L.marker([loc.latitude, loc.longitude], {
          icon: createMarkerIcon(isMain),
        }).addTo(map);

        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
          <div style="font-family: inherit; min-width: 180px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px;">${loc.name}</div>
            <div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-bottom: 6px;">${typeLabels[loc.locationType] || 'Địa điểm'}</div>
            <div style="font-size: 12px; color: #475569; margin-bottom: 8px;">${loc.address}</div>
            <a href="${getGoogleMapsDirectionUrl(loc.latitude, loc.longitude)}" target="_blank" rel="noopener noreferrer" style="
              display: inline-block;
              background: #16a34a;
              color: #ffffff;
              padding: 5px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 700;
              text-decoration: none;
            ">Chỉ đường bằng Google Maps</a>
          </div>
        `;

        marker.bindPopup(popupContent);
        markersRef.current.push(marker);
      });

      if (latLngBounds.length > 1) {
        map.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 16 });
      } else if (latLngBounds.length === 1) {
        map.setView(latLngBounds[0], 15);
      }

      map.invalidateSize();
    }, 150);

    return () => clearTimeout(timer);
  }, [activeTab, locations]);

  const handleDeleteLocation = async (loc: ClanLocation) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa địa điểm '${loc.name}' khỏi bản đồ dòng tộc?`)) {
      return;
    }
    try {
      await deleteClanLocation(effectiveClanId, loc.id);
      setLocations((prev) => prev.filter((item) => item.id !== loc.id));
      showToast(`Đã xóa địa điểm '${loc.name}'.`);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Không thể xóa địa điểm này.');
    }
  };

  const handleReviewProposal = async (proposalId: string, action: 'APPROVE' | 'REJECT') => {
    setReviewingId(proposalId);
    try {
      await reviewLocationProposal(effectiveClanId, proposalId, {
        action,
        reviewNotes: action === 'APPROVE' ? 'Đã xác minh và phê duyệt cập nhật vị trí.' : 'Từ chối do thông tin chưa chính xác.',
      });
      showToast(action === 'APPROVE' ? 'Đã phê duyệt đề xuất và cập nhật vị trí chính thức!' : 'Đã từ chối đề xuất.');
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Lỗi khi xử lý phê duyệt đề xuất.');
    } finally {
      setReviewingId(null);
    }
  };

  const pendingProposalsCount = proposals.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="clan-locations-page">
      {toastMsg && (
        <div style={{
          padding: '12px 20px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#166534',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="clan-locations-header">
        <div>
          <h2 className="clan-locations-title">Bản đồ & Địa điểm Dòng họ</h2>
          <p className="clan-locations-subtitle">
            Số hóa vị trí Nhà thờ tổ, Từ đường, Khu mộ phần và các điểm di tích gắn liền với cội nguồn
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Tab selector */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              style={{
                border: 'none',
                background: activeTab === 'map' ? '#ffffff' : 'transparent',
                color: activeTab === 'map' ? '#0f172a' : '#64748b',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Bản đồ ({locations.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('proposals')}
              style={{
                border: 'none',
                background: activeTab === 'proposals' ? '#ffffff' : 'transparent',
                color: activeTab === 'proposals' ? '#0f172a' : '#64748b',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeTab === 'proposals' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Đề xuất từ thành viên
              {pendingProposalsCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 700,
                }}>
                  {pendingProposalsCount}
                </span>
              )}
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              className="clan-locations-add-btn"
              onClick={() => setEditModalData(null)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Thêm địa điểm dòng họ
            </button>
          )}
        </div>
      </div>

      {activeTab === 'map' ? (
        <>
          {/* Interactive Map Card */}
          <div className="clan-locations-map-card">
            <div className="clan-locations-map-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <strong style={{ fontSize: '14.5px', color: '#1e293b' }}>
                  Toàn cảnh Bản đồ số các địa điểm gia tộc
                </strong>
              </div>
              <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                Nhấp vào từng ghim để xem thông tin và chỉ đường nhanh
              </span>
            </div>
            <div ref={mapContainerRef} className="clan-locations-map-canvas" />
          </div>

          {/* Locations Grid */}
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 700, color: '#1e293b' }}>
              Danh sách địa điểm đã lưu ({locations.length})
            </h3>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Đang tải dữ liệu địa điểm dòng họ...
              </div>
            ) : locations.length === 0 ? (
              <div style={{
                background: '#ffffff',
                border: '1px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                color: '#64748b',
              }}>
                <p style={{ margin: 0, fontSize: '14px' }}>Chưa có địa điểm nào được lưu trong cơ sở dữ liệu dòng họ.</p>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setEditModalData(null)}
                    style={{
                      marginTop: '14px',
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Thêm nhà thờ họ hoặc từ đường đầu tiên
                  </button>
                )}
              </div>
            ) : (
              <div className="clan-locations-grid">
                {locations.map((loc) => (
                  <div key={loc.id} className="clan-location-card">
                    <div>
                      <div className="clan-location-card-top">
                        <span className="clan-location-type-tag">
                          {typeLabels[loc.locationType] || 'Địa điểm'}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: loc.privacyLevel === 'PUBLIC' ? '#f0fdf4' : '#f8fafc',
                          color: loc.privacyLevel === 'PUBLIC' ? '#16a34a' : '#64748b',
                          border: '1px solid',
                          borderColor: loc.privacyLevel === 'PUBLIC' ? '#bbf7d0' : '#e2e8f0',
                        }}>
                          {loc.privacyLevel === 'PUBLIC' ? 'Công khai' : 'Nội bộ dòng họ'}
                        </span>
                      </div>

                      <h4 className="clan-location-card-title" style={{ marginTop: '10px' }}>{loc.name}</h4>

                      <div className="clan-location-address">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>{loc.address}</span>
                      </div>

                      <div className="clan-location-coords">
                        GPS: {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                      </div>

                      {loc.description && (
                        <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
                          {loc.description}
                        </p>
                      )}
                    </div>

                    <div className="clan-location-card-actions">
                      <a
                        href={getGoogleMapsDirectionUrl(loc.latitude, loc.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clan-location-dir-btn"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                        Chỉ đường Google Maps
                      </a>

                      {canManage && (
                        <div className="clan-location-sub-btns">
                          <button
                            type="button"
                            className="clan-location-icon-btn"
                            title="Chỉnh sửa địa điểm"
                            onClick={() => setEditModalData(loc)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="clan-location-icon-btn danger"
                            title="Xóa địa điểm"
                            onClick={() => handleDeleteLocation(loc)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Proposals Tab */
        <div className="proposals-container">
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              Danh sách đề xuất điều chỉnh vị trí từ Thành viên
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
              Các thành viên phát hiện vị trí sai sót đã gửi đề xuất kèm tọa độ mới và căn cứ xác minh
            </p>
          </div>

          {proposals.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Hiện chưa có đề xuất điều chỉnh địa điểm nào từ thành viên.
            </div>
          ) : (
            <div>
              {proposals.map((prop) => (
                <div key={prop.id} className={`proposal-item-card ${prop.status.toLowerCase()}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '15px', color: '#1e293b' }}>
                          {prop.targetType === 'PERSON_BURIAL' ? `Mộ phần: ${prop.personName || 'Tổ tiên'}` : `Địa điểm: ${prop.proposedName || 'Nhà thờ họ'}`}
                        </strong>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: prop.status === 'APPROVED' ? '#dcfce7' : prop.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                          color: prop.status === 'APPROVED' ? '#166534' : prop.status === 'REJECTED' ? '#991b1b' : '#92400e',
                        }}>
                          {prop.status === 'APPROVED' ? 'Đã phê duyệt' : prop.status === 'REJECTED' ? 'Đã từ chối' : 'Chờ phê duyệt'}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#475569', marginTop: '6px' }}>
                        Người đề xuất: <strong>{prop.proposerName || 'Thành viên dòng tộc'}</strong> • Ngày gửi: {prop.createdAt ? new Date(prop.createdAt).toLocaleDateString('vi-VN') : 'Mới đây'}
                      </div>

                      <div style={{ fontSize: '13px', marginTop: '6px' }}>
                        <span style={{ color: '#64748b' }}>Tọa độ đề xuất mới: </span>
                        <strong style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>
                          {prop.proposedLat.toFixed(6)}, {prop.proposedLng.toFixed(6)}
                        </strong>
                        {prop.proposedAddress && <span> • Địa chỉ: {prop.proposedAddress}</span>}
                      </div>

                      <div style={{ marginTop: '8px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', color: '#334155' }}>
                        <span style={{ fontWeight: 600 }}>Lý do đề xuất: </span>{prop.reason || 'Không có lý do chi tiết'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <a
                        href={getGoogleMapsDirectionUrl(prop.proposedLat, prop.proposedLng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '12px',
                          color: '#2563eb',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Xem vị trí đề xuất trên bản đồ →
                      </a>

                      {canManage && prop.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                          <button
                            type="button"
                            disabled={reviewingId === prop.id}
                            onClick={() => handleReviewProposal(prop.id, 'APPROVE')}
                            style={{
                              background: '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '12.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {reviewingId === prop.id ? 'Đang duyệt...' : 'Phê duyệt'}
                          </button>
                          <button
                            type="button"
                            disabled={reviewingId === prop.id}
                            onClick={() => handleReviewProposal(prop.id, 'REJECT')}
                            style={{
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fecaca',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Clan Location Modal */}
      {editModalData !== undefined && (
        <ClanLocationEditModal
          isOpen={true}
          onClose={() => setEditModalData(undefined)}
          clanId={effectiveClanId}
          initialData={editModalData}
          onSuccess={(saved) => {
            showToast(`Đã lưu địa điểm '${saved.name}' thành công.`);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default ClanLocationsModule;

