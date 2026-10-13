import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminPlansMgmt.css';

export interface ServicePlanItem {
  id: string;
  code: string;
  name: string;
  price_vnd: number;
  duration_months: number;
  members_limit: number;
  admins_limit: number;
  storage_limit_gb: number;
  has_ai_analysis: boolean;
  has_3d_memorial: boolean;
  has_family_fund: boolean;
  has_highres_archive: boolean;
  is_active: boolean; // True: Đang bán, False: Ngừng bán
  active_subscribers_count: number;
  created_at: string;
}

const INITIAL_PLANS: ServicePlanItem[] = [];

export const AdminPlansMgmt: React.FC = () => {
  const [plans, setPlans] = useState<ServicePlanItem[]>(INITIAL_PLANS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ServicePlanItem | null>(null);

  // Form
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    price_vnd: 1800000,
    duration_months: 12,
    members_limit: 500,
    admins_limit: 5,
    storage_limit_gb: 20,
    has_ai_analysis: true,
    has_3d_memorial: true,
    has_family_fund: false,
    has_highres_archive: true,
  });

  const toast = useToast();

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData({
      code: `PLAN_${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      price_vnd: 2000000,
      duration_months: 12,
      members_limit: 600,
      admins_limit: 6,
      storage_limit_gb: 30,
      has_ai_analysis: true,
      has_3d_memorial: true,
      has_family_fund: true,
      has_highres_archive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: ServicePlanItem) => {
    setEditingPlan(plan);
    setFormData({
      code: plan.code,
      name: plan.name,
      price_vnd: plan.price_vnd,
      duration_months: plan.duration_months,
      members_limit: plan.members_limit,
      admins_limit: plan.admins_limit,
      storage_limit_gb: plan.storage_limit_gb,
      has_ai_analysis: plan.has_ai_analysis,
      has_3d_memorial: plan.has_3d_memorial,
      has_family_fund: plan.has_family_fund,
      has_highres_archive: plan.has_highres_archive,
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = (plan: ServicePlanItem) => {
    const nextStatus = !plan.is_active;
    setPlans((prev) =>
      prev.map((p) => (p.id === plan.id ? { ...p, is_active: nextStatus } : p))
    );
    if (nextStatus) {
      toast.success('Mở bán lại gói', `Gói "${plan.name}" đã được đưa trở lại danh sách đăng ký mới.`);
    } else {
      toast.warning(
        'Ngừng bán gói dịch vụ',
        `Gói "${plan.name}" đã ngừng bán. ${plan.active_subscribers_count} dòng họ đang sử dụng vẫn được bảo toàn quyền lợi.`
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('Lỗi', 'Vui lòng nhập tên gói và mã định danh gói.');
      return;
    }

    if (editingPlan) {
      setPlans((prev) =>
        prev.map((p) =>
          p.id === editingPlan.id
            ? {
                ...p,
                ...formData,
              }
            : p
        )
      );
      toast.success('Cập nhật thành công', `Đã cập nhật cấu hình cho gói "${formData.name}".`);
    } else {
      const newPlan: ServicePlanItem = {
        id: `PLAN-${Math.floor(100 + Math.random() * 900)}`,
        ...formData,
        is_active: true,
        active_subscribers_count: 0,
        created_at: new Date().toISOString().slice(0, 10),
      };
      setPlans([...plans, newPlan]);
      toast.success('Tạo gói mới thành công', `Đã thêm gói "${newPlan.name}" vào bảng giá dịch vụ.`);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="admin-plans-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản Lý Gói Dịch Vụ & Bảng Giá Nền Tảng</h2>
          <p className="admin-account-subtitle">
            Cấu hình hạn mức thành viên, dung lượng đám mây, tính năng AI/3D và chính sách giá bán cho các dòng họ.
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="btn-add-plan" onClick={handleOpenCreate}>
            + Thiết Lập Gói Mới
          </button>
        </div>
      </div>

      {/* Grid of Plans */}
      <div className="admin-plans-grid">
        {plans.map((plan) => (
          <div key={plan.id} className={`admin-plan-card ${!plan.is_active ? 'inactive' : ''}`}>
            <div className="plan-card-header">
              <div>
                <span className="plan-code-badge">{plan.code}</span>
                <h3 className="plan-title">{plan.name}</h3>
              </div>
              <span className={`status-badge ${plan.is_active ? 'status-approved' : 'status-rejected'}`}>
                {plan.is_active ? 'Đang bán' : 'Ngừng bán'}
              </span>
            </div>

            <div className="plan-pricing-row">
              <span className="plan-price">
                {plan.price_vnd === 0 ? 'Miễn phí' : `${plan.price_vnd.toLocaleString('vi-VN')} đ`}
              </span>
              <span className="plan-duration">/ {plan.duration_months} tháng</span>
            </div>

            <div className="plan-limits-box">
              <div className="limit-row">
                <span>Số thành viên tối đa:</span>
                <strong>{plan.members_limit.toLocaleString('vi-VN')} người</strong>
              </div>
              <div className="limit-row">
                <span>Quản trị viên (Admin) dòng họ:</span>
                <strong>{plan.admins_limit} tài khoản</strong>
              </div>
              <div className="limit-row">
                <span>Dung lượng lưu trữ:</span>
                <strong>{plan.storage_limit_gb} GB</strong>
              </div>
              <div className="limit-row">
                <span>Dòng họ đang sử dụng:</span>
                <strong className="text-active-subs">{plan.active_subscribers_count} gia tộc</strong>
              </div>
            </div>

            <div className="plan-features-list">
              <div className={`feature-item ${plan.has_ai_analysis ? 'included' : 'excluded'}`}>
                {plan.has_ai_analysis ? '✓' : '×'} AI Phân tích gia phả & Huyết thống
              </div>
              <div className={`feature-item ${plan.has_3d_memorial ? 'included' : 'excluded'}`}>
                {plan.has_3d_memorial ? '✓' : '×'} Không gian thờ tự & Tưởng niệm 3D
              </div>
              <div className={`feature-item ${plan.has_family_fund ? 'included' : 'excluded'}`}>
                {plan.has_family_fund ? '✓' : '×'} Quản lý Quỹ dòng họ & Đóng góp
              </div>
              <div className={`feature-item ${plan.has_highres_archive ? 'included' : 'excluded'}`}>
                {plan.has_highres_archive ? '✓' : '×'} Lưu trữ tư liệu Hán Nôm chất lượng cao
              </div>
            </div>

            <div className="plan-card-actions">
              <button className="btn-edit-plan" onClick={() => handleOpenEdit(plan)}>
                Chỉnh sửa
              </button>
              <button
                className={`btn-toggle-sale ${plan.is_active ? 'btn-stop' : 'btn-resume'}`}
                onClick={() => handleToggleActive(plan)}
              >
                {plan.is_active ? 'Ngừng bán' : 'Mở bán lại'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">CẤU HÌNH GÓI DỊCH VỤ</span>
                <h3 className="admin-modal-title">
                  {editingPlan ? `Chỉnh Sửa Gói: ${editingPlan.name}` : 'Thêm Mới Gói Dịch Vụ'}
                </h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="admin-modal-body">
                <div className="admin-dossier-grid">
                  <div className="form-group">
                    <label className="form-label required">Mã Định Danh Gói (Code):</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="VD: PRO_STANDARD"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Tên Gói Hiển Thị:</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="VD: Gói Tiêu Chuẩn (Pro)"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="admin-dossier-grid">
                  <div className="form-group">
                    <label className="form-label required">Giá Niêm Yết (VNĐ):</label>
                    <input
                      type="number"
                      className="admin-search-input-field"
                      value={formData.price_vnd}
                      onChange={(e) => setFormData({ ...formData, price_vnd: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Thời Hạn Gói (Tháng):</label>
                    <input
                      type="number"
                      className="admin-search-input-field"
                      value={formData.duration_months}
                      onChange={(e) => setFormData({ ...formData, duration_months: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                <h4 className="admin-dossier-sec-title" style={{ marginTop: 10 }}>Hạn Mức Sử Dụng</h4>
                <div className="admin-dossier-grid">
                  <div className="form-group">
                    <label className="form-label required">Số Thành Viên Phả Hệ Tối Đa:</label>
                    <input
                      type="number"
                      className="admin-search-input-field"
                      value={formData.members_limit}
                      onChange={(e) => setFormData({ ...formData, members_limit: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Dung Lượng Đám Mây (GB):</label>
                    <input
                      type="number"
                      className="admin-search-input-field"
                      value={formData.storage_limit_gb}
                      onChange={(e) => setFormData({ ...formData, storage_limit_gb: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                <h4 className="admin-dossier-sec-title" style={{ marginTop: 10 }}>Tính Năng Kèm Theo</h4>
                <div className="admin-features-toggle-grid">
                  <label className="feature-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.has_ai_analysis}
                      onChange={(e) => setFormData({ ...formData, has_ai_analysis: e.target.checked })}
                    />
                    <span>Tính năng AI Phân tích gia phả & Cây huyết thống</span>
                  </label>

                  <label className="feature-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.has_3d_memorial}
                      onChange={(e) => setFormData({ ...formData, has_3d_memorial: e.target.checked })}
                    />
                    <span>Không gian Thờ Tự & Tưởng Niệm 3D</span>
                  </label>

                  <label className="feature-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.has_family_fund}
                      onChange={(e) => setFormData({ ...formData, has_family_fund: e.target.checked })}
                    />
                    <span>Quản lý Quỹ Dòng Họ & Sổ Đóng Góp</span>
                  </label>

                  <label className="feature-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.has_highres_archive}
                      onChange={(e) => setFormData({ ...formData, has_highres_archive: e.target.checked })}
                    />
                    <span>Kho Tư Liệu Hán Nôm & Ảnh Gốc Siêu Nét</span>
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-approve">
                  {editingPlan ? 'Lưu Thay Đổi' : 'Thêm Gói Mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlansMgmt;
