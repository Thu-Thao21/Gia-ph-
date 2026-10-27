import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminConfirmDialog,
  AdminModal,
  AdminPageHeader,
  AdminPagination,
  AdminStatePanel,
  AdminStatusBadge,
  AdminToast,
  formatAdminDate,
  formatVnd,
  useAdminToast,
} from './shared';
import { ServicePackage, ServicePackageStatus } from './types';
import './PlatformAdmin.css';

const PAGE_SIZE = 4;

interface PackageFormState {
  code: string;
  name: string;
  description: string;
  monthlyPrice: string;
  durationMonths: string;
  memberLimit: string;
  storageGb: string;
  features: string;
  status: ServicePackageStatus;
}

const emptyPackageForm: PackageFormState = {
  code: '',
  name: '',
  description: '',
  monthlyPrice: '',
  durationMonths: '12',
  memberLimit: '500',
  storageGb: '20',
  features: '',
  status: 'draft',
};

function packageToForm(item: ServicePackage): PackageFormState {
  return {
    code: item.code,
    name: item.name,
    description: item.description,
    monthlyPrice: String(item.monthlyPrice),
    durationMonths: String(item.durationMonths),
    memberLimit: String(item.memberLimit),
    storageGb: String(item.storageGb),
    features: item.features.join('\n'),
    status: item.status,
  };
}

import apiClient from '../../../api/axios';

export const ServicePackageManagement: React.FC = () => {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ServicePackageStatus>('all');
  const [page, setPage] = useState(1);
  const [detailPackage, setDetailPackage] = useState<ServicePackage | null>(null);
  const [modalTab, setModalTab] = useState<'detail' | 'edit'>('detail');
  const [editorMode, setEditorMode] = useState<'create' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageFormState>(emptyPackageForm);
  const [formError, setFormError] = useState('');
  const [confirmPackage, setConfirmPackage] = useState<ServicePackage | null>(null);
  const { toast, showToast, dismissToast } = useAdminToast();

  const loadPackages = useCallback(() => {
    setLoading(true);
    apiClient.get<any>('/admin/service-plans')
      .catch(() => apiClient.get<any>('/service-plans'))
      .then((res) => {
        const items = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
        const mapped: ServicePackage[] = items.map((p: any) => ({
          id: p.id || p.plan_id,
          code: p.code || p.plan_code || 'PLAN',
          name: p.name || 'Gói dịch vụ',
          description: p.description || '',
          monthlyPrice: p.price_cents ? p.price_cents / 100 : (p.monthly_price !== undefined ? p.monthly_price : (p.price ? Number(p.price) / (p.billing_period_months || 12) : 0)),
          durationMonths: p.duration_months || p.billing_period_months || 12,
          memberLimit: p.member_limit || p.max_members || 500,
          storageGb: p.storage_gb || (p.storage_mb ? Math.round(p.storage_mb / 1024) : 20),
          subscriberCount: p.subscriber_count || 0,
          features: Array.isArray(p.features) ? p.features.map((f: any) => typeof f === 'string' ? f : f.feature_code || '') : ['Cây gia phả', 'Hồ sơ thành viên'],
          status: (p.status || 'active').toLowerCase() === 'active' ? 'active' : 'disabled',
          updatedAt: p.updated_at ? p.updated_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        }));
        setPackages(mapped);
      })
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  useEffect(() => setPage(1), [searchQuery, statusFilter]);

  const filteredPackages = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return packages.filter((item) => {
      const matchesSearch = !needle || [item.name, item.code, item.description]
        .some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [packages, searchQuery, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPackages.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePackages = filteredPackages.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activeSubscribers = packages
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + item.subscriberCount, 0);

  const openCreate = () => {
    setDetailPackage(null);
    setEditingId(null);
    setForm({ ...emptyPackageForm });
    setFormError('');
    setEditorMode('create');
  };

  const openDetail = (item: ServicePackage) => {
    setDetailPackage(item);
    setEditingId(item.id);
    setForm(packageToForm(item));
    setFormError('');
    setModalTab('detail');
    setEditorMode(null);
  };

  const openEdit = (item: ServicePackage) => {
    setDetailPackage(item);
    setEditingId(item.id);
    setForm(packageToForm(item));
    setFormError('');
    setModalTab('edit');
    setEditorMode(null);
  };

  const closeDetailModal = () => {
    setDetailPackage(null);
    setEditingId(null);
    setFormError('');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingId(null);
    setFormError('');
  };

  const updateForm = <K extends keyof PackageFormState>(key: K, value: PackageFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = form.code.trim().toUpperCase().replace(/\s+/g, '-');
    const features = form.features.split('\n').map((item) => item.trim()).filter(Boolean);
    const price = Number(form.monthlyPrice);
    const duration = Number(form.durationMonths);
    const memberLimit = Number(form.memberLimit);
    const storage = Number(form.storageGb);

    if (!form.name.trim() || !code || !form.description.trim()) {
      setFormError('Vui lòng nhập đầy đủ tên, mã và mô tả gói dịch vụ.');
      return;
    }
    if ([price, duration, memberLimit, storage].some((value) => Number.isNaN(value) || value < 0)) {
      setFormError('Giá, thời hạn, giới hạn thành viên và dung lượng phải là số hợp lệ.');
      return;
    }
    if (features.length === 0) {
      setFormError('Gói dịch vụ cần có ít nhất một tính năng.');
      return;
    }
    if (packages.some((item) => item.code === code && item.id !== editingId)) {
      setFormError(`Mã gói ${code} đã tồn tại.`);
      return;
    }

    const payload = {
      code,
      name: form.name.trim(),
      description: form.description.trim(),
      price: price * (duration || 12),
      billing_period_months: duration || 12,
      max_members: memberLimit,
      max_family_admins: 5,
      storage_mb: storage * 1024,
      features,
      status: form.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    };

    try {
      if (editingId && !editingId.startsWith('pkg-')) {
        await apiClient.put(`/admin/service-plans/${editingId}`, payload);
        showToast(`Đã cập nhật gói “${form.name}”.`);
      } else {
        await apiClient.post('/admin/service-plans', payload);
        showToast(`Đã tạo gói “${form.name}” thành công.`);
      }
      loadPackages();
      if (detailPackage) {
        setDetailPackage((prev) => prev ? {
          ...prev,
          code,
          name: form.name.trim(),
          description: form.description.trim(),
          monthlyPrice: price,
          durationMonths: duration || 12,
          memberLimit,
          storageGb: storage,
          features,
          status: form.status,
        } : null);
        setModalTab('detail');
      }
      if (editorMode === 'create') {
        closeEditor();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi lưu gói dịch vụ.';
      setFormError(msg);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmPackage) return;
    const nextStatus: ServicePackageStatus = confirmPackage.status === 'active' ? 'disabled' : 'active';
    try {
      if (!confirmPackage.id.startsWith('pkg-')) {
        await apiClient.patch(`/admin/service-plans/${confirmPackage.id}/status`, {
          status: nextStatus === 'active' ? 'ACTIVE' : 'INACTIVE',
        });
      }
      showToast(nextStatus === 'active'
        ? `Đã bật gói “${confirmPackage.name}”.`
        : `Đã tắt gói “${confirmPackage.name}”.`, nextStatus === 'active' ? 'success' : 'info');
      loadPackages();
    } catch (err: any) {
      showToast(`Đổi trạng thái thất bại: ${err?.message || 'Lỗi kết nối'}`, 'error');
    } finally {
      setConfirmPackage(null);
    }
  };

  return (
    <section className="s6a-page">
      <AdminToast toast={toast} onDismiss={dismissToast} />
      <AdminPageHeader
        eyebrow="QUẢN TRỊ NỀN TẢNG"
        title="Quản lý Gói Dịch vụ"
        description="Tạo, cấu hình và kiểm soát vòng đời các gói dịch vụ dành cho từng quy mô dòng họ."
        actions={<button type="button" className="s6a-button primary" onClick={openCreate}>+ Tạo gói mới</button>}
      />

      <div className="s6a-metric-grid three">
        <article className="s6a-metric-card">
          <span>Gói đang hoạt động</span>
          <strong>{packages.filter((item) => item.status === 'active').length}</strong>
          <small>Trên tổng số {packages.length} gói</small>
        </article>
        <article className="s6a-metric-card">
          <span>Thuê bao đang sử dụng</span>
          <strong>{activeSubscribers.toLocaleString('vi-VN')}</strong>
          <small>Thuộc các gói đang mở</small>
        </article>
        <article className="s6a-metric-card">
          <span>Doanh thu niêm yết/tháng</span>
          <strong>{formatVnd(packages.filter((item) => item.status === 'active').reduce((sum, item) => sum + item.monthlyPrice * item.subscriberCount, 0))}</strong>
          <small>Ước tính theo gói kích hoạt</small>
        </article>
      </div>

      <div className="s6a-content-card">
        <div className="s6a-card-heading">
          <div>
            <h2>Danh sách gói</h2>
            <p>Bấm vào bất kỳ dòng nào để xem chi tiết và chỉnh sửa gói dịch vụ.</p>
          </div>
          <span className="s6a-count-pill">{filteredPackages.length} kết quả</span>
        </div>

        <div className="s6a-filter-bar">
          <label className="s6a-search-field">
            <span className="s6a-visually-hidden">Tìm kiếm gói dịch vụ</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm theo tên, mã hoặc mô tả..."
            />
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ServicePackageStatus)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="draft">Bản nháp</option>
              <option value="disabled">Đã tắt</option>
            </select>
          </label>
        </div>

        {loading ? (
          <AdminStatePanel kind="loading" message="Đang tải cấu hình gói dịch vụ..." />
        ) : visiblePackages.length === 0 ? (
          <AdminStatePanel
            kind="empty"
            title="Không tìm thấy gói phù hợp"
            message="Thử thay đổi từ khóa hoặc bộ lọc trạng thái."
            action={<button type="button" className="s6a-button secondary" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>Đặt lại bộ lọc</button>}
          />
        ) : (
          <>
            <div className="s6a-table-wrap">
              <table className="s6a-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Gói dịch vụ</th>
                    <th style={{ width: '18%' }}>Giá / Thời hạn</th>
                    <th style={{ width: '18%' }}>Giới hạn</th>
                    <th style={{ width: '10%' }}>Thuê bao</th>
                    <th style={{ width: '12%' }}>Trạng thái</th>
                    <th style={{ width: '14%', textAlign: 'right' }} className="s6a-actions-column">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePackages.map((item) => (
                    <tr
                      key={item.id}
                      className="s6a-row-clickable"
                      onClick={() => openDetail(item)}
                      title="Bấm để xem chi tiết & chỉnh sửa gói dịch vụ"
                    >
                      <td>
                        <div className="s6a-primary-cell">
                          <strong>{item.name}</strong>
                          <span>{item.code} · Cập nhật {formatAdminDate(item.updatedAt)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="s6a-primary-cell compact">
                          <strong>{item.monthlyPrice === 0 ? 'Miễn phí' : formatVnd(item.monthlyPrice)}</strong>
                          <span>{item.durationMonths} tháng</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <span>{item.memberLimit.toLocaleString('vi-VN')} thành viên</span>
                          <div className="s6a-muted">{item.storageGb} GB</div>
                        </div>
                      </td>
                      <td><strong>{item.subscriberCount.toLocaleString('vi-VN')}</strong></td>
                      <td><AdminStatusBadge status={item.status} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="s6a-row-actions">
                          <button type="button" className="s6a-link-button" onClick={() => openDetail(item)}>Chi tiết</button>
                          <button type="button" className="s6a-link-button" onClick={() => openEdit(item)}>Sửa</button>
                          <button
                            type="button"
                            className={`s6a-link-button ${item.status === 'active' ? 'danger-text' : 'success-text'}`}
                            onClick={() => setConfirmPackage(item)}
                          >
                            {item.status === 'active' ? 'Tắt' : 'Bật'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={safePage} totalItems={filteredPackages.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* Package Detail & Edit Modal */}
      {detailPackage && (
        <AdminModal
          open={Boolean(detailPackage)}
          title={modalTab === 'detail' ? detailPackage.name : `Chỉnh sửa: ${detailPackage.name}`}
          description={detailPackage ? `Mã gói: ${detailPackage.code} · Cập nhật: ${formatAdminDate(detailPackage.updatedAt)}` : undefined}
          onClose={closeDetailModal}
          size="lg"
          footer={
            modalTab === 'detail' ? (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={`s6a-button ${detailPackage.status === 'active' ? 'danger' : 'secondary'}`}
                    onClick={() => {
                      const pkg = detailPackage;
                      setDetailPackage(null);
                      setConfirmPackage(pkg);
                    }}
                  >
                    {detailPackage.status === 'active' ? 'Tắt gói dịch vụ' : 'Kích hoạt gói dịch vụ'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="s6a-button secondary" onClick={closeDetailModal}>Đóng</button>
                  <button type="button" className="s6a-button primary" onClick={() => setModalTab('edit')}>Chỉnh sửa gói</button>
                </div>
              </>
            ) : (
              <>
                <button type="button" className="s6a-button secondary" onClick={() => setModalTab('detail')}>Xem chi tiết</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="s6a-button secondary" onClick={closeDetailModal}>Hủy</button>
                  <button type="submit" form="s6a-package-form-inline" className="s6a-button primary" disabled={!form.name.trim() || !form.code.trim()}>
                    Lưu thay đổi
                  </button>
                </div>
              </>
            )
          }
        >
          {/* Modal Navigation Tabs (Clean pure text, NO icons) */}
          <div className="s6a-modal-nav-tabs">
            <button
              type="button"
              className={`s6a-modal-tab ${modalTab === 'detail' ? 'active' : ''}`}
              onClick={() => setModalTab('detail')}
            >
              Thông tin chi tiết
            </button>
            <button
              type="button"
              className={`s6a-modal-tab ${modalTab === 'edit' ? 'active' : ''}`}
              onClick={() => {
                if (detailPackage) {
                  setForm(packageToForm(detailPackage));
                }
                setModalTab('edit');
              }}
            >
              Chỉnh sửa cấu hình
            </button>
          </div>

          {modalTab === 'detail' ? (
            <div className="s6a-detail-layout">
              <div className="s6a-detail-grid">
                <div><span>Trạng thái</span><AdminStatusBadge status={detailPackage.status} /></div>
                <div><span>Giá mỗi tháng</span><strong>{detailPackage.monthlyPrice === 0 ? 'Miễn phí' : formatVnd(detailPackage.monthlyPrice)}</strong></div>
                <div><span>Thời hạn thanh toán</span><strong>{detailPackage.durationMonths} tháng</strong></div>
                <div><span>Số lượng thuê bao</span><strong>{detailPackage.subscriberCount.toLocaleString('vi-VN')}</strong></div>
                <div><span>Giới hạn thành viên</span><strong>{detailPackage.memberLimit.toLocaleString('vi-VN')} thành viên</strong></div>
                <div><span>Dung lượng lưu trữ</span><strong>{detailPackage.storageGb} GB</strong></div>
              </div>
              <div className="s6a-detail-section">
                <h3>Mô tả gói dịch vụ</h3>
                <p>{detailPackage.description || 'Chưa có mô tả cho gói dịch vụ này.'}</p>
              </div>
              <div className="s6a-detail-section">
                <h3>Tính năng bao gồm ({detailPackage.features.length})</h3>
                <ul className="s6a-feature-list">
                  {detailPackage.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </div>
            </div>
          ) : (
            <form id="s6a-package-form-inline" className="s6a-form" onSubmit={handleSave}>
              {formError && <div className="s6a-inline-alert error" role="alert">{formError}</div>}
              <div className="s6a-form-grid two">
                <label><span>Tên gói <b>*</b></span><input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Ví dụ: Dòng họ Tiêu chuẩn" /></label>
                <label><span>Mã gói <b>*</b></span><input value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="STANDARD" /></label>
                <label><span>Giá mỗi tháng (VNĐ)</span><input type="number" min="0" value={form.monthlyPrice} onChange={(event) => updateForm('monthlyPrice', event.target.value)} /></label>
                <label><span>Thời hạn (tháng)</span><input type="number" min="1" value={form.durationMonths} onChange={(event) => updateForm('durationMonths', event.target.value)} /></label>
                <label><span>Giới hạn thành viên</span><input type="number" min="1" value={form.memberLimit} onChange={(event) => updateForm('memberLimit', event.target.value)} /></label>
                <label><span>Dung lượng lưu trữ (GB)</span><input type="number" min="1" value={form.storageGb} onChange={(event) => updateForm('storageGb', event.target.value)} /></label>
                <label className="span-two"><span>Trạng thái</span><select value={form.status} onChange={(event) => updateForm('status', event.target.value as ServicePackageStatus)}><option value="draft">Bản nháp</option><option value="active">Đang hoạt động</option><option value="disabled">Đã tắt</option></select></label>
                <label className="span-two"><span>Mô tả <b>*</b></span><textarea rows={3} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Mục đích và đối tượng sử dụng gói..." /></label>
                <label className="span-two"><span>Tính năng — mỗi dòng một mục <b>*</b></span><textarea rows={5} value={form.features} onChange={(event) => updateForm('features', event.target.value)} placeholder={'Cây gia phả đa chế độ\nKho tư liệu số\nNhắc lịch tự động'} /></label>
              </div>
            </form>
          )}
        </AdminModal>
      )}

      {/* Package Create Modal */}
      {editorMode === 'create' && (
        <AdminModal
          open={true}
          title="Tạo Gói Dịch vụ Mới"
          description="Các trường có dấu * là bắt buộc."
          onClose={closeEditor}
          size="lg"
          footer={
            <>
              <button type="button" className="s6a-button secondary" onClick={closeEditor}>Hủy</button>
              <button type="submit" form="s6a-package-form-create" className="s6a-button primary" disabled={!form.name.trim() || !form.code.trim()}>
                Tạo gói
              </button>
            </>
          }
        >
          <form id="s6a-package-form-create" className="s6a-form" onSubmit={handleSave}>
            {formError && <div className="s6a-inline-alert error" role="alert">{formError}</div>}
            <div className="s6a-form-grid two">
              <label><span>Tên gói <b>*</b></span><input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Ví dụ: Dòng họ Tiêu chuẩn" /></label>
              <label><span>Mã gói <b>*</b></span><input value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="STANDARD" /></label>
              <label><span>Giá mỗi tháng (VNĐ)</span><input type="number" min="0" value={form.monthlyPrice} onChange={(event) => updateForm('monthlyPrice', event.target.value)} /></label>
              <label><span>Thời hạn (tháng)</span><input type="number" min="1" value={form.durationMonths} onChange={(event) => updateForm('durationMonths', event.target.value)} /></label>
              <label><span>Giới hạn thành viên</span><input type="number" min="1" value={form.memberLimit} onChange={(event) => updateForm('memberLimit', event.target.value)} /></label>
              <label><span>Dung lượng lưu trữ (GB)</span><input type="number" min="1" value={form.storageGb} onChange={(event) => updateForm('storageGb', event.target.value)} /></label>
              <label className="span-two"><span>Trạng thái</span><select value={form.status} onChange={(event) => updateForm('status', event.target.value as ServicePackageStatus)}><option value="draft">Bản nháp</option><option value="active">Đang hoạt động</option><option value="disabled">Đã tắt</option></select></label>
              <label className="span-two"><span>Mô tả <b>*</b></span><textarea rows={3} value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Mục đích và đối tượng sử dụng gói..." /></label>
              <label className="span-two"><span>Tính năng — mỗi dòng một mục <b>*</b></span><textarea rows={5} value={form.features} onChange={(event) => updateForm('features', event.target.value)} placeholder={'Cây gia phả đa chế độ\nKho tư liệu số\nNhắc lịch tự động'} /></label>
            </div>
          </form>
        </AdminModal>
      )}

      <AdminConfirmDialog
        open={Boolean(confirmPackage)}
        title={confirmPackage?.status === 'active' ? 'Tắt Gói Dịch vụ?' : 'Bật Gói Dịch vụ?'}
        message={confirmPackage?.status === 'active'
          ? `Gói “${confirmPackage?.name}” sẽ không nhận đăng ký mới. Thuê bao hiện hữu vẫn được giữ nguyên trong hệ thống.`
          : `Gói “${confirmPackage?.name}” sẽ xuất hiện trong danh sách có thể đăng ký.`}
        confirmLabel={confirmPackage?.status === 'active' ? 'Tắt gói' : 'Bật gói'}
        tone={confirmPackage?.status === 'active' ? 'danger' : 'primary'}
        onCancel={() => setConfirmPackage(null)}
        onConfirm={handleToggleStatus}
      />
    </section>
  );
};

export default ServicePackageManagement;
