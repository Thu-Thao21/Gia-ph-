import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../../../api/axios';
import './AdminFamiliesMgmt.css';

const PersonIcon: React.FC<{ size?: number; className?: string }> = ({ size = 26, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M20 21V19C20 16.7909 18.2091 15 16 15H8C5.79086 15 4 16.7909 4 19V21"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="7"
      r="4"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface FamilyItem {
  id: string;
  clan_code?: string;
  name: string;
  founder_name?: string;
  origin_place?: string;
  ancestral_house_address?: string;
  history?: string;
  description?: string;
  branches?: string[];
  status?: string;
}

export interface AdminFamiliesMgmtProps {
  onViewTree?: (familyId: string) => void;
}

type ModalMode = 'detail' | 'add' | null;
type ModalTab = 'detail' | 'edit';

export const AdminFamiliesMgmt: React.FC<AdminFamiliesMgmtProps> = ({ onViewTree }) => {
  const [families, setFamilies] = useState<FamilyItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('detail');
  const [selectedFamily, setSelectedFamily] = useState<FamilyItem | null>(null);
  const [formData, setFormData] = useState<Partial<FamilyItem>>({
    name: '',
    founder_name: '',
    origin_place: '',
    ancestral_house_address: '',
    history: '',
    description: '',
  });
  const [msg, setMsg] = useState<string>('');

  const isPlaceholder = (val?: string) => !val || val === 'Chưa cập nhật' || val === 'Đang cập nhật';

  const fetchFamilies = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>('/families');
      if (Array.isArray(res.data)) {
        const mapped: FamilyItem[] = res.data.map((f: any) => {
          const rawDesc = f.description || '';
          const isClanCodeInDesc = rawDesc.startsWith('Mã dòng họ:');
          const clanCode = f.clan_code || (isClanCodeInDesc ? rawDesc.replace('Mã dòng họ:', '').trim() : undefined);
          const cleanDesc = isClanCodeInDesc ? '' : rawDesc;

          return {
            id: f.id || f.clan_id,
            clan_code: clanCode || (f.id ? `CLAN-${f.id.slice(0, 6).toUpperCase()}` : undefined),
            name: f.name || f.clan_name || 'Dòng họ',
            founder_name: f.founder_name || f.representative_name || 'Chưa cập nhật',
            origin_place: f.origin_place || 'Chưa cập nhật',
            ancestral_house_address: f.ancestral_house_address || f.address || 'Chưa cập nhật',
            history: f.history || '',
            description: cleanDesc,
            branches: f.branches && f.branches.length > 0 ? f.branches : [],
            status: f.status || 'active',
          };
        });
        setFamilies(mapped);
      } else {
        setFamilies([]);
      }
    } catch (err: any) {
      console.error('Không thể tải danh sách dòng họ từ Neon DB:', err);
      setFamilies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFamilies();
  }, []);

  useEffect(() => {
    if (!modalMode) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalMode(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [modalMode]);

  const handleOpenDetailModal = (fam: FamilyItem) => {
    setSelectedFamily(fam);
    setFormData({ ...fam });
    setModalTab('detail');
    setModalMode('detail');
  };

  const handleOpenEditModal = (fam: FamilyItem) => {
    setSelectedFamily(fam);
    setFormData({ ...fam });
    setModalTab('edit');
    setModalMode('detail');
  };

  const handleOpenAddModal = () => {
    setSelectedFamily(null);
    setFormData({
      name: '',
      founder_name: '',
      origin_place: '',
      ancestral_house_address: '',
      history: '',
      description: '',
    });
    setModalMode('add');
  };

  const handleDeleteFamily = (fam: FamilyItem) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa dòng họ "${fam.name}"?`)) {
      setFamilies((prev) => prev.filter((f) => f.id !== fam.id));
      if (selectedFamily?.id === fam.id) {
        setModalMode(null);
      }
      setMsg(`Đã xóa dòng họ "${fam.name}" thành công.`);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleSaveFamily = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    if (modalMode === 'detail' && selectedFamily) {
      const updated: FamilyItem = {
        ...selectedFamily,
        ...formData,
        name: formData.name.trim(),
      };
      setFamilies((prev) => prev.map((f) => (f.id === selectedFamily.id ? updated : f)));
      setSelectedFamily(updated);
      setModalTab('detail');
      setMsg(`Cập nhật dòng họ "${updated.name}" thành công!`);
    } else {
      const newFam: FamilyItem = {
        id: `fam_${Date.now()}`,
        clan_code: `CLAN-${Date.now().toString().slice(-6).toUpperCase()}`,
        name: formData.name.trim(),
        founder_name: formData.founder_name || 'Chưa cập nhật',
        origin_place: formData.origin_place || 'Chưa cập nhật',
        ancestral_house_address: formData.ancestral_house_address || 'Chưa cập nhật',
        history: formData.history || '',
        description: formData.description || '',
        branches: ['Chi Trưởng', 'Chi Thứ'],
        status: 'active',
      };
      setFamilies((prev) => [newFam, ...prev]);
      setModalMode(null);
      setMsg(`Thêm mới dòng họ "${newFam.name}" thành công!`);
    }

    setTimeout(() => setMsg(''), 3200);
  };

  const filteredFamilies = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return families.filter((f) => {
      return (
        f.name.toLowerCase().includes(q) ||
        (f.founder_name || '').toLowerCase().includes(q) ||
        (f.origin_place || '').toLowerCase().includes(q) ||
        (f.clan_code || '').toLowerCase().includes(q) ||
        (f.ancestral_house_address || '').toLowerCase().includes(q)
      );
    });
  }, [families, searchTerm]);

  const activeCount = useMemo(() => {
    return families.filter((f) => f.status !== 'inactive' && f.status !== 'hidden').length;
  }, [families]);

  const totalBranches = useMemo(() => {
    return families.reduce((acc, f) => acc + (f.branches?.length || 0), 0);
  }, [families]);

  return (
    <div className="admin-families-container">
      {/* Breadcrumb */}
      <div className="family-members-breadcrumb" aria-label="Đường dẫn">
        <span>Quản lý gia phả</span>
        <span className="family-breadcrumb-sep">/</span>
        <strong>Dòng họ &amp; Thủy tổ</strong>
      </div>

      {/* Hero Banner (Màu xanh chuẩn nhận diện thương hiệu) */}
      <header className="family-hero-banner">
        <div className="family-hero-text">
          <span className="family-hero-eyebrow">QUẢN TRỊ DÒNG HỌ &amp; GIA TỘC</span>
          <h1 className="family-hero-title">Quản Lý Danh Sách Dòng Họ &amp; Thủy Tổ</h1>
          <p className="family-hero-desc">
            Quản lý hồ sơ, nguồn gốc quê quán, thủy tổ khởi xướng và các chi nhánh dòng họ.
          </p>
        </div>
        <button type="button" className="family-hero-btn-primary" onClick={handleOpenAddModal}>
          + Thêm Dòng Họ Mới
        </button>
      </header>

      {/* Stats Counter Bar */}
      <div className="family-hero-stats" aria-label="Thống kê dòng họ">
        <div>
          <span>Tổng số dòng họ</span>
          <strong>{families.length}</strong>
        </div>
        <div>
          <span>Đang hoạt động</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Tổng số chi nhánh</span>
          <strong>{totalBranches}</strong>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="family-list-toolbar">
        <div className="family-search-field">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên dòng họ, quê quán, thủy tổ, mã dòng họ..."
          />
          {searchTerm && (
            <button
              type="button"
              className="family-search-clear-btn"
              onClick={() => setSearchTerm('')}
              aria-label="Xóa tìm kiếm"
            >
              ✕
            </button>
          )}
        </div>
        <div className="family-toolbar-info">
          <span>Bấm vào bất kỳ dòng nào để xem chi tiết &amp; sửa</span>
          <strong>({filteredFamilies.length} kết quả)</strong>
        </div>
      </div>

      {msg && <div className="admin-msg-box alert-success">{msg}</div>}

      {/* Main List Display */}
      {loading ? (
        <div className="admin-table-loading">
          <p>Đang tải danh sách dòng họ...</p>
        </div>
      ) : filteredFamilies.length === 0 ? (
        <div className="admin-table-empty">
          <p>Không tìm thấy dòng họ nào phù hợp với từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div className="family-list-container" role="list">
          {filteredFamilies.map((fam) => (
            <div
              key={fam.id}
              className="family-list-item"
              role="listitem"
              onClick={() => handleOpenDetailModal(fam)}
              title="Bấm để xem chi tiết và chỉnh sửa dòng họ này"
            >
              {/* Header row of list item */}
              <div className="family-list-header">
                <div className="family-list-identity">
                  <div className="family-emblem-box">
                    <PersonIcon size={26} className="family-person-icon" />
                  </div>
                  <div className="family-title-col">
                    <div className="family-name-row">
                      <h3 className="family-list-name">{fam.name}</h3>
                      {fam.clan_code && <span className="fam-code-pill">{fam.clan_code}</span>}
                      <span className="family-status-pill">
                        <i className="family-status-dot" /> Đang hoạt động
                      </span>
                    </div>
                    <span className="family-id-subtext">
                      Mã hệ thống: <code>#{fam.id.length > 20 ? fam.id.slice(0, 18) + '...' : fam.id}</code>
                    </span>
                  </div>
                </div>

                <div className="family-list-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="fam-btn fam-btn-view"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDetailModal(fam);
                    }}
                    title="Xem chi tiết"
                  >
                    Chi tiết
                  </button>
                  {onViewTree && (
                    <button
                      type="button"
                      className="fam-btn fam-btn-view"
                      style={{ color: '#0d9488', borderColor: '#0d9488' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewTree(fam.id);
                      }}
                      title="Xem cây gia phả dòng họ này"
                    >
                      Xem Cây
                    </button>
                  )}
                  <button
                    type="button"
                    className="fam-btn fam-btn-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(fam);
                    }}
                    title="Chỉnh sửa thông tin"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="fam-btn fam-btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFamily(fam);
                    }}
                    title="Xóa dòng họ"
                  >
                    Xóa
                  </button>
                </div>
              </div>

              {/* Meta details: 4 Luxury Structured Tiles */}
              <div className="family-list-meta-grid">
                <div className="family-meta-col">
                  <span className="meta-col-label">Thủy tổ</span>
                  <span className={`meta-col-val ${isPlaceholder(fam.founder_name) ? 'muted' : ''}`}>
                    {fam.founder_name || 'Chưa cập nhật'}
                  </span>
                </div>

                <div className="family-meta-col">
                  <span className="meta-col-label">Quê quán / Gốc họ</span>
                  <span className={`meta-col-val ${isPlaceholder(fam.origin_place) ? 'muted' : ''}`}>
                    {fam.origin_place || 'Chưa cập nhật'}
                  </span>
                </div>

                <div className="family-meta-col">
                  <span className="meta-col-label">Nhà thờ họ / Từ đường</span>
                  <span className={`meta-col-val ${isPlaceholder(fam.ancestral_house_address) ? 'muted' : ''}`}>
                    {fam.ancestral_house_address || 'Chưa cập nhật'}
                  </span>
                </div>

                <div className="family-meta-col">
                  <span className="meta-col-label">Chi / Nhánh ({fam.branches?.length || 0})</span>
                  <div className="family-branch-tags">
                    {fam.branches && fam.branches.length > 0 ? (
                      fam.branches.map((b, i) => (
                        <span key={i} className="branch-tag">
                          {b}
                        </span>
                      ))
                    ) : (
                      <span className="meta-col-val muted">Chưa phân chi</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unified Detail & Edit Modal */}
      {modalMode === 'detail' && selectedFamily && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalMode(null);
          }}
        >
          <div
            className="admin-modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clan-modal-title"
          >
            {/* Header */}
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-eyebrow">HỒ SƠ DÒNG HỌ</span>
                <h3 id="clan-modal-title" className="admin-modal-title">
                  {modalTab === 'detail' ? selectedFamily.name : 'Chỉnh sửa thông tin dòng họ'}
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalMode(null)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Segmented Control Tabs */}
            <div className="admin-modal-tabs">
              <button
                type="button"
                className={`admin-modal-tab ${modalTab === 'detail' ? 'active' : ''}`}
                onClick={() => setModalTab('detail')}
              >
                Hồ sơ chi tiết
              </button>
              <button
                type="button"
                className={`admin-modal-tab ${modalTab === 'edit' ? 'active' : ''}`}
                onClick={() => setModalTab('edit')}
              >
                Chỉnh sửa thông tin
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="admin-modal-scroll">
              {modalTab === 'detail' ? (
                <div className="family-detail-wrapper">
                  {/* Hero Card */}
                  <div className="family-hero-card">
                    <div className="family-hero-emblem">
                      <PersonIcon size={28} className="family-hero-person-icon" />
                    </div>
                    <div className="family-hero-info">
                      <h4 className="family-hero-name">{selectedFamily.name}</h4>
                      <div className="family-hero-badges">
                        {selectedFamily.clan_code && (
                          <span className="fam-code-pill">{selectedFamily.clan_code}</span>
                        )}
                        <span className="family-status-pill">
                          <i className="family-status-dot" /> Đang hoạt động
                        </span>
                        <span className="fam-id-pill">
                          ID: #{selectedFamily.id.slice(0, 12)}...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Detail Specs Grid */}
                  <div className="family-detail-grid">
                    <div className="family-detail-card">
                      <span className="detail-card-label">Thủy tổ / Cụ tổ khởi xướng</span>
                      <strong className="detail-card-val">
                        {selectedFamily.founder_name || 'Chưa cập nhật'}
                      </strong>
                    </div>

                    <div className="family-detail-card">
                      <span className="detail-card-label">Quê quán / Nguồn gốc họ</span>
                      <strong className="detail-card-val">
                        {selectedFamily.origin_place || 'Chưa cập nhật'}
                      </strong>
                    </div>

                    <div className="family-detail-card wide">
                      <span className="detail-card-label">Địa chỉ nhà thờ họ / Từ đường</span>
                      <strong className="detail-card-val">
                        {selectedFamily.ancestral_house_address || 'Chưa cập nhật'}
                      </strong>
                    </div>

                    <div className="family-detail-card wide">
                      <span className="detail-card-label">Danh sách các Chi / Nhánh</span>
                      <div className="family-branch-tags" style={{ marginTop: '4px' }}>
                        {selectedFamily.branches && selectedFamily.branches.length > 0 ? (
                          selectedFamily.branches.map((b, i) => (
                            <span key={i} className="branch-tag">
                              {b}
                            </span>
                          ))
                        ) : (
                          <span className="muted">Chưa phân chi</span>
                        )}
                      </div>
                    </div>

                    {selectedFamily.history && (
                      <div className="family-detail-card wide">
                        <span className="detail-card-label">Lịch sử dòng họ</span>
                        <p className="detail-card-text">{selectedFamily.history}</p>
                      </div>
                    )}

                    {selectedFamily.description && (
                      <div className="family-detail-card wide">
                        <span className="detail-card-label">Ghi chú & Mô tả</span>
                        <p className="detail-card-text">{selectedFamily.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Edit Form */
                <form id="family-edit-form" onSubmit={handleSaveFamily} className="family-edit-form">
                  <div className="form-group-admin">
                    <label className="form-label-admin">
                      Tên Dòng Họ <b>*</b>
                    </label>
                    <input
                      type="text"
                      className="form-input-admin"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ví dụ: Dòng Họ Nguyễn Văn (Đại Tộc)"
                      required
                    />
                  </div>

                  <div className="admin-form-grid-2">
                    <div className="form-group-admin">
                      <label className="form-label-admin">Thủy Tổ / Cụ Tổ Khởi Xướng</label>
                      <input
                        type="text"
                        className="form-input-admin"
                        value={formData.founder_name || ''}
                        onChange={(e) => setFormData({ ...formData, founder_name: e.target.value })}
                        placeholder="Ví dụ: Cụ Nguyễn Văn A (Đời thứ 1)"
                      />
                    </div>

                    <div className="form-group-admin">
                      <label className="form-label-admin">Quê Quán / Nguồn Gốc</label>
                      <input
                        type="text"
                        className="form-input-admin"
                        value={formData.origin_place || ''}
                        onChange={(e) => setFormData({ ...formData, origin_place: e.target.value })}
                        placeholder="Ví dụ: Làng Cổ, Thường Tín, Hà Nội"
                      />
                    </div>
                  </div>

                  <div className="form-group-admin">
                    <label className="form-label-admin">Địa Chỉ Nhà Thờ Họ / Từ Đường</label>
                    <input
                      type="text"
                      className="form-input-admin"
                      value={formData.ancestral_house_address || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, ancestral_house_address: e.target.value })
                      }
                      placeholder="Ví dụ: Số 12 Đường Nhà Thờ Tổ, Thường Tín, Hà Nội"
                    />
                  </div>

                  <div className="form-group-admin">
                    <label className="form-label-admin">Lịch Sử Dòng Họ</label>
                    <textarea
                      className="form-input-admin"
                      rows={3}
                      value={formData.history || ''}
                      onChange={(e) => setFormData({ ...formData, history: e.target.value })}
                      placeholder="Nhập tóm tắt lịch sử hình thành, niên đại..."
                    />
                  </div>

                  <div className="form-group-admin">
                    <label className="form-label-admin">Ghi Chú / Mô Tả</label>
                    <textarea
                      className="form-input-admin"
                      rows={2}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Ghi chú thêm..."
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="admin-modal-footer">
              {modalTab === 'detail' ? (
                <>
                  <button
                    type="button"
                    className="admin-btn-danger"
                    onClick={() => handleDeleteFamily(selectedFamily)}
                  >
                    Xóa dòng họ
                  </button>
                  <div className="admin-footer-actions">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={() => setModalMode(null)}
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      className="admin-btn-primary"
                      onClick={() => setModalTab('edit')}
                    >
                      Chỉnh sửa thông tin
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => setModalTab('detail')}
                  >
                    Quay lại chi tiết
                  </button>
                  <div className="admin-footer-actions">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={() => setModalMode(null)}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      form="family-edit-form"
                      className="admin-btn-primary"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Add Clan */}
      {modalMode === 'add' && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalMode(null);
          }}
        >
          <div
            className="admin-modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clan-add-title"
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-eyebrow">DÒNG HỌ MỚI</span>
                <h3 id="clan-add-title" className="admin-modal-title">
                  Tạo Dòng Họ Mới
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalMode(null)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-scroll">
              <form id="family-add-form" onSubmit={handleSaveFamily} className="family-edit-form">
                <div className="form-group-admin">
                  <label className="form-label-admin">
                    Tên Dòng Họ <b>*</b>
                  </label>
                  <input
                    type="text"
                    className="form-input-admin"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ví dụ: Dòng Họ Nguyễn Văn (Đại Tộc)"
                    required
                    autoFocus
                  />
                </div>

                <div className="admin-form-grid-2">
                  <div className="form-group-admin">
                    <label className="form-label-admin">Thủy Tổ / Cụ Tổ Khởi Xướng</label>
                    <input
                      type="text"
                      className="form-input-admin"
                      value={formData.founder_name || ''}
                      onChange={(e) => setFormData({ ...formData, founder_name: e.target.value })}
                      placeholder="Ví dụ: Cụ Nguyễn Văn A (Đời thứ 1)"
                    />
                  </div>

                  <div className="form-group-admin">
                    <label className="form-label-admin">Quê Quán / Nguồn Gốc</label>
                    <input
                      type="text"
                      className="form-input-admin"
                      value={formData.origin_place || ''}
                      onChange={(e) => setFormData({ ...formData, origin_place: e.target.value })}
                      placeholder="Ví dụ: Làng Cổ, Thường Tín, Hà Nội"
                    />
                  </div>
                </div>

                <div className="form-group-admin">
                  <label className="form-label-admin">Địa Chỉ Nhà Thờ Họ / Từ Đường</label>
                  <input
                    type="text"
                    className="form-input-admin"
                    value={formData.ancestral_house_address || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, ancestral_house_address: e.target.value })
                    }
                    placeholder="Ví dụ: Số 12 Đường Nhà Thờ Tổ, Thường Tín, Hà Nội"
                  />
                </div>

                <div className="form-group-admin">
                  <label className="form-label-admin">Lịch Sử Dòng Họ</label>
                  <textarea
                    className="form-input-admin"
                    rows={3}
                    value={formData.history || ''}
                    onChange={(e) => setFormData({ ...formData, history: e.target.value })}
                    placeholder="Nhập tóm tắt lịch sử hình thành, niên đại..."
                  />
                </div>
              </form>
            </div>

            <div className="admin-modal-footer">
              <div style={{ marginLeft: 'auto' }} className="admin-footer-actions">
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => setModalMode(null)}
                >
                  Hủy
                </button>
                <button type="submit" form="family-add-form" className="admin-btn-primary">
                  Tạo dòng họ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFamiliesMgmt;
