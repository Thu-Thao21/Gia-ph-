import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchFamilies } from '../../../services/member.service';
import { fetchPublicClans } from '../../../services/genealogy.service';
import type { Family } from '../../../types/member';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import circularEmblemLogo from '../../../assets/logo/logo_circular_emblem.png';
import './PublicFamilySearchPage.css';

export const PublicFamilySearchPage: React.FC = () => {
  const [families, setFamilies] = useState<Family[]>([]);
  const [searchName, setSearchName] = useState('');
  const [searchRegion, setSearchRegion] = useState('');
  const [selectedPublicFamily, setSelectedPublicFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicClans()
      .then((clans) => {
        if (Array.isArray(clans) && clans.length > 0) {
          setFamilies(
            clans.map((c) => ({
              id: c.id,
              name: c.name,
              code: c.clan_code,
              description:
                c.description ||
                (c.name.includes('Võ')
                  ? 'Dòng họ có bề dày lịch sử và truyền thống hiếu học lâu đời tại vùng đất Gò Nổi, Quảng Nam.'
                  : c.name.includes('Mai')
                  ? 'Mai Thế Tộc có cội nguồn từ Cố đô Huế, gìn giữ gia phong và nề nếp gia giáo qua nhiều thế hệ.'
                  : 'Dòng họ có cội nguồn lâu đời, con cháu kế tục nề nếp gia phong và truyền thống tốt đẹp của tổ tiên qua nhiều thế hệ.'),
              originPlace:
                c.origin_place ||
                (c.name.includes('Quảng Nam')
                  ? 'Gò Nổi, Quảng Nam'
                  : c.name.includes('Huế')
                  ? 'Phong Điền, Thừa Thiên Huế'
                  : 'Việt Nam'),
              ancestralAddress:
                c.ancestral_house_address ||
                (c.name.includes('Quảng Nam')
                  ? 'Từ đường dòng họ đặt tại Gò Nổi, Thị xã Điện Bàn, Tỉnh Quảng Nam'
                  : c.name.includes('Huế')
                  ? 'Nhà thờ họ đặt tại Làng cổ Phước Tích, Phong Điền, Thừa Thiên Huế'
                  : 'Nhà thờ tổ dòng họ'),
              memberCount: c.memberCount || c.member_count || 50,
              status: c.status || 'ACTIVE',
            }))
          );
        } else {
          fetchFamilies().then((fams) => {
            setFamilies(
              fams.map((f) => ({
                ...f,
                description:
                  f.description ||
                  (f.name.includes('Võ')
                    ? 'Dòng họ có bề dày lịch sử và truyền thống hiếu học lâu đời tại vùng đất Gò Nổi, Quảng Nam.'
                    : f.name.includes('Mai')
                    ? 'Mai Thế Tộc có cội nguồn từ Cố đô Huế, gìn giữ gia phong và nề nếp gia giáo qua nhiều thế hệ.'
                    : 'Dòng họ có cội nguồn lâu đời, con cháu kế tục nề nếp gia phong qua nhiều thế hệ.'),
                ancestralAddress:
                  f.ancestralAddress ||
                  (f.name.includes('Quảng Nam')
                    ? 'Từ đường dòng họ đặt tại Gò Nổi, Thị xã Điện Bàn, Tỉnh Quảng Nam'
                    : f.name.includes('Huế')
                    ? 'Nhà thờ họ đặt tại Làng cổ Phước Tích, Phong Điền, Thừa Thiên Huế'
                    : 'Nhà thờ tổ dòng họ'),
              }))
            );
          });
        }
      })
      .catch(() => {
        fetchFamilies().then((fams) => setFamilies(fams));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredFamilies = families.filter((f) => {
    const matchesName =
      f.name.toLowerCase().includes(searchName.toLowerCase()) ||
      (f.code || '').toLowerCase().includes(searchName.toLowerCase());
    const matchesRegion =
      !searchRegion || (f.description || '').toLowerCase().includes(searchRegion.toLowerCase());
    return matchesName && matchesRegion;
  });

  return (
    <PublicLayout>
      <div className="pub-search-container">
        {/* Banner tiêu đề trang tra cứu */}
        <div className="pub-search-header">
          <div className="pub-search-header-badge">
            <span>HỆ THỐNG PHẢ HỆ QUỐC GIA</span>
          </div>
          <h1 className="pub-search-title">Tra Cứu Dòng Họ Công Khai</h1>
          <p className="pub-search-subtitle">
            Khám phá thông tin các dòng họ Việt Nam đã được đăng ký và xác thực công khai trên nền tảng.
          </p>

          <div className="pub-search-bar-row">
            <div className="pub-search-input-wrap">
              <svg className="pub-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="pub-search-input"
                placeholder="Nhập tên dòng họ hoặc mã dòng họ (VD: Họ Trần, Họ Nguyễn, CLAN-...)..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>

            <div className="pub-search-input-wrap">
              <svg className="pub-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <input
                type="text"
                className="pub-search-input"
                placeholder="Địa phương / Quê gốc (Hà Nội, Nghệ An, Hải Dương...)..."
                value={searchRegion}
                onChange={(e) => setSearchRegion(e.target.value)}
              />
            </div>
          </div>

          <div className="pub-search-results-meta">
            <span>Tìm thấy <strong>{filteredFamilies.length}</strong> dòng họ phù hợp</span>
          </div>
        </div>

        {/* Lưới danh sách thẻ dòng họ */}
        {loading ? (
          <div className="pub-search-loading">
            <div className="pub-search-spinner" />
            <span>Đang tải danh sách dòng họ công khai...</span>
          </div>
        ) : filteredFamilies.length === 0 ? (
          <div className="pub-search-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <h3>Không tìm thấy dòng họ nào</h3>
            <p>Vui lòng thử lại với từ khóa khác hoặc xóa bộ lọc để xem toàn bộ danh sách.</p>
          </div>
        ) : (
          <div className="pub-families-grid">
            {filteredFamilies.map((f) => (
              <div key={f.id} className="pub-family-card">
                <div className="pub-family-card-head">
                  <div className="pub-family-emblem-box">
                    <img src={circularEmblemLogo} alt="Gia Phả Việt" className="pub-family-emblem-img" />
                  </div>
                  <div className="pub-family-card-title-col">
                    <div className="pub-family-badge-row">
                      <span className="pub-family-verified-tag">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Xác thực
                      </span>
                    </div>
                    <h3 className="family-name" title={f.name}>
                      {f.name}
                    </h3>
                  </div>
                </div>

                <p className="family-desc">{f.description || 'Dòng họ Việt Nam được xác thực công khai.'}</p>

                <div className="family-stats-row">
                  <div className="family-stat-chip">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>{f.memberCount || 50}+ thành viên</span>
                  </div>

                  <div className="family-stat-chip">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span>Việt Nam</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="view-public-profile-btn"
                  onClick={() => setSelectedPublicFamily(f)}
                >
                  <span>Xem hồ sơ công khai</span>
                  <svg className="view-profile-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Modal View Public Family Profile qua Portal */}
        {selectedPublicFamily && typeof document !== 'undefined' && createPortal(
          <div
            className="pub-profile-modal-overlay"
            onClick={() => setSelectedPublicFamily(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="pub-profile-modal-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pub-profile-header">
                <div className="pub-profile-header-left">
                  <div className="pub-profile-emblem-box">
                    <img src={circularEmblemLogo} alt="Gia Phả Việt" className="pub-profile-emblem-img" />
                  </div>
                  <div>
                    <div className="pub-profile-badge-row">
                      <span className="public-only-badge">
                        <span className="pub-badge-dot" />
                        DÒNG HỌ ĐÃ XÁC THỰC
                      </span>
                      <span className="pub-profile-code">Mã: {selectedPublicFamily.code || selectedPublicFamily.id}</span>
                    </div>
                    <h2 className="pub-profile-title">{selectedPublicFamily.name}</h2>
                  </div>
                </div>

                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setSelectedPublicFamily(null)}
                  title="Đóng (Esc)"
                >
                  ✕
                </button>
              </div>

              <div className="pub-profile-body">
                <div className="pub-info-box">
                  <h4 className="pub-box-title">
                    <span className="pub-box-dot" />
                    Lịch sử & Truyền thống dòng tộc
                  </h4>
                  <p className="pub-box-content">
                    {selectedPublicFamily.description || 'Dòng họ có cội nguồn lâu đời, con cháu kế tục nề nếp gia phong và truyền thống tốt đẹp của tổ tiên qua nhiều thế hệ.'}
                  </p>
                </div>

                <div className="pub-info-box">
                  <h4 className="pub-box-title">
                    <span className="pub-box-dot" />
                    Quê quán & Nhà thờ tổ
                  </h4>
                  <p className="pub-box-content">
                    {selectedPublicFamily.ancestralAddress || (
                      selectedPublicFamily.originPlace
                        ? `Từ đường dòng họ đặt tại: ${selectedPublicFamily.originPlace}.`
                        : (selectedPublicFamily.name.includes('Quảng Nam')
                            ? 'Từ đường dòng họ đặt tại: Gò Nổi, Thị xã Điện Bàn, Tỉnh Quảng Nam.'
                            : selectedPublicFamily.name.includes('Huế')
                            ? 'Nhà thờ họ đặt tại: Làng cổ Phước Tích, Huyện Phong Điền, Tỉnh Thừa Thiên Huế.'
                            : 'Nhà thờ tổ và từ đường dòng họ được lưu giữ tại quê gốc truyền đời.')
                    )}
                  </p>
                </div>

                <div className="pub-privacy-note">
                  <div className="pub-privacy-note-content">
                    <svg className="pub-privacy-note-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <div>
                      <strong>Thông tin gia tộc:</strong> Cây phả hệ chi tiết và thông tin liên lạc được lưu hành nội bộ để bảo vệ quyền riêng tư gia đình. Con cháu và thân tộc vui lòng đăng nhập để tra cứu đầy đủ.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pub-profile-modal-footer">
                <button
                  type="button"
                  className="pub-profile-modal-btn-close"
                  onClick={() => setSelectedPublicFamily(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </PublicLayout>
  );
};

export default PublicFamilySearchPage;
