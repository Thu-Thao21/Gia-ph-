import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminBusinessesMgmt.css';

export interface BusinessItem {
  id: string;
  code: string;
  name: string;
  province: string;
  representative_name: string;
  representative_email: string;
  representative_phone: string;
  account_username?: string;
  account_status?: 'ACTIVE' | 'PENDING_ACTIVATION' | 'LOCKED';
  plan_name: string;
  plan_id: string;
  subscription_status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED';
  expires_at: string;
  members_count: number;
  members_limit: number;
  storage_used_gb: number;
  storage_limit_gb: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_SETUP';
  suspended_reason?: string;
  suspended_at?: string;
  created_at: string;
}

const INITIAL_BUSINESSES: BusinessItem[] = [];

export const AdminBusinessesMgmt: React.FC = () => {
  const [businesses, setBusinesses] = useState<BusinessItem[]>(INITIAL_BUSINESSES);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Selected Business for details/actions
  const [selectedBiz, setSelectedBiz] = useState<BusinessItem | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  
  // Wizard Modal: Tạo Business & Cấp Account (M03)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardData, setWizardData] = useState({
    familyName: '',
    province: '',
    planId: 'PLAN-PRO',
    planName: 'Gói Tiêu Chuẩn (Pro)',
    managerName: '',
    managerUsername: '',
    managerEmail: '',
    managerPhone: '',
    tempPassword: '',
  });

  // Modal: Tạm ngưng (M04)
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  // Modal: Kích hoạt / Mở khóa (M04)
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);

  // Modal: Quản lý Subscription & Hạn mức (M06)
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subAction, setSubAction] = useState<'RENEW' | 'CHANGE_PLAN'>('RENEW');
  const [targetPlanId, setTargetPlanId] = useState('PLAN-ENT');
  const [renewMonths, setRenewMonths] = useState(12);

  const toast = useToast();

  // Filter
  const filtered = businesses.filter((b) => {
    const matchStatus = filterStatus === 'ALL' || b.status === filterStatus;
    const matchSearch =
      b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.representative_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.province.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Open Details
  const handleOpenDetail = (biz: BusinessItem) => {
    setSelectedBiz(biz);
    setIsDetailDrawerOpen(true);
  };

  // Open Wizard
  const handleOpenWizard = (initialName = '', initialProvince = '', initialRep = '', initialEmail = '', initialPhone = '') => {
    const generatedCode = `FAM-NEW-${Math.floor(100 + Math.random() * 900)}`;
    const defaultUsername = initialRep
      ? `truongtoc_${initialRep.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : `truongtoc_${Math.floor(1000 + Math.random() * 9000)}`;
    const autoTempPass = `MFGMS@${Math.floor(100000 + Math.random() * 900000)}`;

    setWizardData({
      familyName: initialName || '',
      province: initialProvince || 'Hà Nội',
      planId: 'PLAN-PRO',
      planName: 'Gói Tiêu Chuẩn (Pro)',
      managerName: initialRep || '',
      managerUsername: defaultUsername,
      managerEmail: initialEmail || '',
      managerPhone: initialPhone || '',
      tempPassword: autoTempPass,
    });
    setWizardStep(1);
    setIsWizardOpen(true);
  };

  // Execute Wizard Submission
  const handleCompleteWizard = () => {
    const newBiz: BusinessItem = {
      id: `BUS-${Math.floor(100 + Math.random() * 900)}`,
      code: `FAM-${wizardData.familyName.slice(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      name: wizardData.familyName,
      province: wizardData.province,
      representative_name: wizardData.managerName,
      representative_email: wizardData.managerEmail,
      representative_phone: wizardData.managerPhone,
      account_username: wizardData.managerUsername,
      account_status: 'PENDING_ACTIVATION',
      plan_name: wizardData.planName,
      plan_id: wizardData.planId,
      subscription_status: 'ACTIVE',
      expires_at: '2027-09-14',
      members_count: 1,
      members_limit: wizardData.planId === 'PLAN-ENT' ? 3000 : wizardData.planId === 'PLAN-ADV' ? 1000 : 500,
      storage_used_gb: 0.1,
      storage_limit_gb: wizardData.planId === 'PLAN-ENT' ? 100 : wizardData.planId === 'PLAN-ADV' ? 50 : 20,
      status: 'PENDING_SETUP',
      created_at: new Date().toISOString().slice(0, 10),
    };

    setBusinesses([newBiz, ...businesses]);
    setIsWizardOpen(false);
    toast.success(
      'Khởi tạo thành công!',
      `Đã tạo không gian "${newBiz.name}" và cấp tài khoản "${newBiz.account_username}" kèm mật khẩu tạm.`
    );
  };

  // Handle Activation
  const handleConfirmActivate = () => {
    if (!selectedBiz) return;
    setBusinesses((prev) =>
      prev.map((b) =>
        b.id === selectedBiz.id
          ? { ...b, status: 'ACTIVE', account_status: 'ACTIVE', suspended_reason: undefined }
          : b
      )
    );
    setSelectedBiz((prev) => (prev ? { ...prev, status: 'ACTIVE', account_status: 'ACTIVE' } : null));
    setIsActivateModalOpen(false);
    toast.success('Kích hoạt thành công!', `Dòng họ "${selectedBiz.name}" đã chính thức chuyển sang trạng thái HOẠT ĐỘNG (ACTIVE).`);
  };

  // Handle Suspend
  const handleConfirmSuspend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBiz) return;
    if (!suspendReason.trim()) {
      toast.error('Thiếu thông tin', 'Vui lòng nhập lý do tạm ngưng không gian dòng họ.');
      return;
    }

    setBusinesses((prev) =>
      prev.map((b) =>
        b.id === selectedBiz.id
          ? {
              ...b,
              status: 'SUSPENDED',
              suspended_reason: suspendReason.trim(),
              suspended_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
            }
          : b
      )
    );
    setSelectedBiz((prev) =>
      prev
        ? {
            ...prev,
            status: 'SUSPENDED',
            suspended_reason: suspendReason.trim(),
            suspended_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
          }
        : null
    );
    setIsSuspendModalOpen(false);
    toast.error('Tạm ngưng Business', `Đã tạm ngưng hoạt động của "${selectedBiz.name}". Dữ liệu được bảo toàn.`);
  };

  // Handle Subscription Change
  const handleConfirmSubscription = () => {
    if (!selectedBiz) return;
    if (subAction === 'RENEW') {
      const currentExp = new Date(selectedBiz.expires_at);
      currentExp.setMonth(currentExp.getMonth() + renewMonths);
      const newExpDate = currentExp.toISOString().slice(0, 10);

      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === selectedBiz.id
            ? { ...b, expires_at: newExpDate, subscription_status: 'ACTIVE' }
            : b
        )
      );
      setSelectedBiz((prev) => (prev ? { ...prev, expires_at: newExpDate, subscription_status: 'ACTIVE' } : null));
      toast.success('Gia hạn thành công!', `Đã gia hạn thêm ${renewMonths} tháng đến ngày ${newExpDate}.`);
    } else {
      const planMap: Record<string, { name: string; limit: number; storage: number }> = {
        'PLAN-ENT': { name: 'Gói Đại Gia Tộc (Enterprise)', limit: 3000, storage: 100 },
        'PLAN-ADV': { name: 'Gói Nâng Cao (Advanced)', limit: 1000, storage: 50 },
        'PLAN-PRO': { name: 'Gói Tiêu Chuẩn (Pro)', limit: 500, storage: 20 },
      };
      const chosen = planMap[targetPlanId] || planMap['PLAN-ENT'];

      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === selectedBiz.id
            ? {
                ...b,
                plan_id: targetPlanId,
                plan_name: chosen.name,
                members_limit: chosen.limit,
                storage_limit_gb: chosen.storage,
              }
            : b
        )
      );
      setSelectedBiz((prev) =>
        prev
          ? {
              ...prev,
              plan_id: targetPlanId,
              plan_name: chosen.name,
              members_limit: chosen.limit,
              storage_limit_gb: chosen.storage,
            }
          : null
      );
      toast.success('Thay đổi gói thành công!', `Dòng họ "${selectedBiz.name}" đã được chuyển sang ${chosen.name}.`);
    }
    setIsSubModalOpen(false);
  };

  return (
    <div className="admin-biz-container">
      {/* Header Banner */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản Lý Không Gian Dòng Họ (Business)</h2>
          <p className="admin-account-subtitle">
            Khởi tạo không gian, cấp tài khoản Trưởng tộc, kiểm tra điều kiện kích hoạt, tạm ngưng và quản lý gói đăng ký.
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="btn-create-biz" onClick={() => handleOpenWizard()}>
            + Tạo Không Gian Mới
          </button>
        </div>
      </div>

      {/* Filter and Stats Bar */}
      <div className="admin-biz-bar">
        <div className="admin-biz-pills">
          <button
            className={`admin-pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ALL')}
          >
            Tất cả ({businesses.length})
          </button>
          <button
            className={`admin-pill-btn approved ${filterStatus === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ACTIVE')}
          >
            Đang hoạt động ({businesses.filter((b) => b.status === 'ACTIVE').length})
          </button>
          <button
            className={`admin-pill-btn pending ${filterStatus === 'PENDING_SETUP' ? 'active' : ''}`}
            onClick={() => setFilterStatus('PENDING_SETUP')}
          >
            Chờ kích hoạt ({businesses.filter((b) => b.status === 'PENDING_SETUP').length})
          </button>
          <button
            className={`admin-pill-btn rejected ${filterStatus === 'SUSPENDED' ? 'active' : ''}`}
            onClick={() => setFilterStatus('SUSPENDED')}
          >
            Đang tạm ngưng ({businesses.filter((b) => b.status === 'SUSPENDED').length})
          </button>
        </div>

        <div className="admin-search-wrapper" style={{ maxWidth: 360 }}>
          <svg className="admin-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="admin-search-input-field"
            placeholder="Tìm theo tên họ, mã, đại diện..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Family</th>
              <th>Tên Dòng Họ</th>
              <th>Đại Diện (Trưởng Tộc)</th>
              <th>Gói Dịch Vụ</th>
              <th>Hạn Mức Đã Dùng</th>
              <th>Hạn Sử Dụng</th>
              <th>Trạng Thái</th>
              <th style={{ textAlign: 'right' }}>Thao Tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  Không tìm thấy dòng họ nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              filtered.map((biz) => {
                const memPercent = Math.round((biz.members_count / biz.members_limit) * 100);
                const storagePercent = Math.round((biz.storage_used_gb / biz.storage_limit_gb) * 100);

                return (
                  <tr key={biz.id} className="admin-table-row">
                    <td>
                      <span className="admin-code-tag">{biz.code}</span>
                    </td>
                    <td>
                      <div className="admin-strong-text">{biz.name}</div>
                      <div className="admin-sub-info">Khu vực: {biz.province}</div>
                    </td>
                    <td>
                      <div className="admin-strong-text">{biz.representative_name}</div>
                      <div className="admin-sub-info">@{biz.account_username || 'Chưa cấp'}</div>
                    </td>
                    <td>
                      <span className="admin-plan-badge">{biz.plan_name}</span>
                    </td>
                    <td>
                      <div className="admin-usage-cell">
                        <div className="admin-usage-item">
                          <span>TV: {biz.members_count}/{biz.members_limit}</span>
                          <div className="admin-mini-progress">
                            <div className="admin-mini-bar" style={{ width: `${Math.min(100, memPercent)}%` }} />
                          </div>
                        </div>
                        <div className="admin-usage-item">
                          <span>Dung lượng: {biz.storage_used_gb}GB</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-strong-text">{biz.expires_at}</div>
                      {biz.subscription_status === 'EXPIRED' ? (
                        <span className="status-badge status-rejected" style={{ fontSize: 10, padding: '2px 6px' }}>Hết hạn</span>
                      ) : (
                        <span className="status-badge status-approved" style={{ fontSize: 10, padding: '2px 6px' }}>Còn hạn</span>
                      )}
                    </td>
                    <td>
                      {biz.status === 'ACTIVE' && <span className="status-badge status-approved">Hoạt động</span>}
                      {biz.status === 'PENDING_SETUP' && <span className="status-badge status-pending">Chờ kích hoạt</span>}
                      {biz.status === 'SUSPENDED' && <span className="status-badge status-rejected">Tạm ngưng</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="admin-action-btn-group">
                        <button
                          className="btn-action-view"
                          title="Xem chi tiết & Quản lý"
                          onClick={() => handleOpenDetail(biz)}
                        >
                          Quản lý
                        </button>
                        <button
                          className="btn-action-sub"
                          title="Gói dịch vụ & Gia hạn"
                          onClick={() => {
                            setSelectedBiz(biz);
                            setIsSubModalOpen(true);
                          }}
                        >
                          Gói
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail & Lifecycle Drawer */}
      {isDetailDrawerOpen && selectedBiz && (
        <div className="admin-modal-backdrop" onClick={() => setIsDetailDrawerOpen(false)}>
          <div className="admin-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-drawer-header">
              <div>
                <span className="admin-code-tag">{selectedBiz.code}</span>
                <h3 className="admin-drawer-title">{selectedBiz.name}</h3>
                <span className="admin-drawer-sub">Địa phương: {selectedBiz.province} • Tạo ngày: {selectedBiz.created_at}</span>
              </div>
              <button className="admin-modal-close" onClick={() => setIsDetailDrawerOpen(false)}>×</button>
            </div>

            <div className="admin-drawer-body">
              {/* Lifecycle Alert Box */}
              <div className={`admin-lifecycle-status-card ${selectedBiz.status.toLowerCase()}`}>
                <div className="admin-lifecycle-header">
                  <strong>Trạng thái vận hành: {selectedBiz.status === 'ACTIVE' ? 'Đang Hoạt Động (ACTIVE)' : selectedBiz.status === 'SUSPENDED' ? 'Tạm Ngưng Dịch Vụ (SUSPENDED)' : 'Chờ Kích Hoạt (PENDING_SETUP)'}</strong>
                  {selectedBiz.status === 'ACTIVE' && (
                    <button
                      className="btn-lifecycle-suspend"
                      onClick={() => {
                        setSuspendReason('');
                        setIsSuspendModalOpen(true);
                      }}
                    >
                      Tạm ngưng Business
                    </button>
                  )}
                  {(selectedBiz.status === 'SUSPENDED' || selectedBiz.status === 'PENDING_SETUP') && (
                    <button
                      className="btn-lifecycle-activate"
                      onClick={() => setIsActivateModalOpen(true)}
                    >
                      Kích hoạt / Mở khóa
                    </button>
                  )}
                </div>
                {selectedBiz.suspended_reason && (
                  <div className="admin-suspended-info">
                    <strong>Lý do tạm ngưng:</strong> {selectedBiz.suspended_reason} (Vào lúc: {selectedBiz.suspended_at})
                  </div>
                )}
              </div>

              {/* Head Account Section */}
              <div className="admin-drawer-section">
                <h4 className="admin-drawer-sec-heading">Tài Khoản Trưởng Tộc (Primary Account)</h4>
                <div className="admin-drawer-info-grid">
                  <div>
                    <label>Họ tên Trưởng tộc:</label>
                    <p>{selectedBiz.representative_name}</p>
                  </div>
                  <div>
                    <label>Tên đăng nhập:</label>
                    <p className="admin-code-text">@{selectedBiz.account_username || 'Chưa thiết lập'}</p>
                  </div>
                  <div>
                    <label>Email liên hệ:</label>
                    <p>{selectedBiz.representative_email}</p>
                  </div>
                  <div>
                    <label>Số điện thoại:</label>
                    <p>{selectedBiz.representative_phone}</p>
                  </div>
                </div>
              </div>

              {/* Subscription & Entitlements Section */}
              <div className="admin-drawer-section">
                <div className="admin-drawer-sec-header">
                  <h4 className="admin-drawer-sec-heading">Gói Đăng Ký & Quyền Hiệu Lực</h4>
                  <button
                    className="btn-sub-manage-link"
                    onClick={() => setIsSubModalOpen(true)}
                  >
                    Thay đổi gói / Gia hạn →
                  </button>
                </div>
                <div className="admin-plan-overview-card">
                  <div className="admin-plan-header">
                    <div>
                      <h5 className="admin-plan-name">{selectedBiz.plan_name}</h5>
                      <span className="admin-plan-expire">Thời hạn đến: {selectedBiz.expires_at}</span>
                    </div>
                    <span className="status-badge status-approved">{selectedBiz.subscription_status}</span>
                  </div>

                  <div className="admin-limits-grid">
                    <div className="admin-limit-item">
                      <label>Số thành viên đã số hóa:</label>
                      <div className="admin-limit-val">{selectedBiz.members_count} / {selectedBiz.members_limit} người</div>
                      <div className="admin-mini-progress">
                        <div
                          className="admin-mini-bar"
                          style={{ width: `${(selectedBiz.members_count / selectedBiz.members_limit) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="admin-limit-item">
                      <label>Dung lượng lưu trữ đám mây:</label>
                      <div className="admin-limit-val">{selectedBiz.storage_used_gb} GB / {selectedBiz.storage_limit_gb} GB</div>
                      <div className="admin-mini-progress">
                        <div
                          className="admin-mini-bar"
                          style={{ width: `${(selectedBiz.storage_used_gb / selectedBiz.storage_limit_gb) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-drawer-footer">
              <button className="btn-modal-cancel" onClick={() => setIsDetailDrawerOpen(false)}>
                Đóng Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Modal: Tạo Business & Cấp Account (M03) */}
      {isWizardOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsWizardOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">Quy Trình Tạo Business & Cấp Tài Khoản</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsWizardOpen(false)}>×</button>
            </div>

            {/* Stepper Tabs */}
            <div className="admin-wizard-stepper">
              <div className={`admin-step-item ${wizardStep === 1 ? 'active' : wizardStep > 1 ? 'done' : ''}`}>
                <span className="admin-step-num">1</span>
                <span className="admin-step-label">Tạo Không Gian</span>
              </div>
              <div className="admin-step-line" />
              <div className={`admin-step-item ${wizardStep === 2 ? 'active' : wizardStep > 2 ? 'done' : ''}`}>
                <span className="admin-step-num">2</span>
                <span className="admin-step-label">Cấp Account Trưởng Tộc</span>
              </div>
              <div className="admin-step-line" />
              <div className={`admin-step-item ${wizardStep === 3 ? 'active' : ''}`}>
                <span className="admin-step-num">3</span>
                <span className="admin-step-label">Mật Khẩu Tạm</span>
              </div>
            </div>

            <div className="admin-modal-body">
              {wizardStep === 1 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 1: Khởi Tạo Không Gian Dòng Họ</h4>
                  <p className="admin-step-desc">Tạo mã định danh duy nhất và không gian lưu trữ cho gia tộc.</p>
                  
                  <div className="form-group">
                    <label className="form-label required">Tên Dòng Họ / Chi Họ:</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="Ví dụ: Tộc Nguyễn Văn (Đại Tôn Thường Tín)"
                      value={wizardData.familyName}
                      onChange={(e) => setWizardData({ ...wizardData, familyName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Tỉnh / Thành Phố Trụ Sở Nhà Thờ Họ:</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="Ví dụ: Hà Nội, Nghệ An, Hải Phòng..."
                      value={wizardData.province}
                      onChange={(e) => setWizardData({ ...wizardData, province: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Gói Dịch Vụ Ban Đầu:</label>
                    <select
                      className="admin-search-input-field"
                      value={wizardData.planId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const pname = pid === 'PLAN-ENT' ? 'Gói Đại Gia Tộc (Enterprise)' : pid === 'PLAN-ADV' ? 'Gói Nâng Cao (Advanced)' : 'Gói Tiêu Chuẩn (Pro)';
                        setWizardData({ ...wizardData, planId: pid, planName: pname });
                      }}
                    >
                      <option value="PLAN-PRO">Gói Tiêu Chuẩn (Pro) - 500 thành viên, 20GB</option>
                      <option value="PLAN-ADV">Gói Nâng Cao (Advanced) - 1,000 thành viên, 50GB</option>
                      <option value="PLAN-ENT">Gói Đại Gia Tộc (Enterprise) - 3,000 thành viên, 100GB</option>
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 2: Cấp Tài Khoản Trưởng Tộc</h4>
                  <p className="admin-step-desc">Thiết lập tài khoản quản trị cao nhất của dòng họ.</p>

                  <div className="form-group">
                    <label className="form-label required">Họ và Tên Người Quản Lý (Trưởng Tộc):</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="Ví dụ: Nguyễn Văn Hùng"
                      value={wizardData.managerName}
                      onChange={(e) => setWizardData({ ...wizardData, managerName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Tên Đăng Nhập (Username):</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="truongtoc_xxx"
                      value={wizardData.managerUsername}
                      onChange={(e) => setWizardData({ ...wizardData, managerUsername: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-dossier-grid">
                    <div className="form-group">
                      <label className="form-label required">Email Khôi Phục & Tiếp Nhận:</label>
                      <input
                        type="email"
                        className="admin-search-input-field"
                        placeholder="email@example.com"
                        value={wizardData.managerEmail}
                        onChange={(e) => setWizardData({ ...wizardData, managerEmail: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Số Điện Thoại:</label>
                      <input
                        type="text"
                        className="admin-search-input-field"
                        placeholder="09xx xxx xxx"
                        value={wizardData.managerPhone}
                        onChange={(e) => setWizardData({ ...wizardData, managerPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 3: Cấp Mật Khẩu Tạm Thời</h4>
                  <p className="admin-step-desc">
                    Hệ thống tự động khởi tạo mật khẩu tạm có thời hạn hiệu lực 7 ngày và bắt buộc đổi mật khẩu khi đăng nhập lần đầu.
                  </p>

                  <div className="admin-temp-pass-card">
                    <span className="admin-temp-pass-label">Mật khẩu tạm được sinh tự động:</span>
                    <div className="admin-temp-pass-val">{wizardData.tempPassword}</div>
                    <small className="admin-temp-pass-hint">
                      Mật khẩu tạm sẽ được gửi qua Email <strong>{wizardData.managerEmail}</strong> và SMS tới <strong>{wizardData.managerPhone}</strong>.
                    </small>
                  </div>

                  <div className="admin-summary-box">
                    <div className="admin-summary-item">
                      <span>Dòng họ:</span>
                      <strong>{wizardData.familyName} ({wizardData.province})</strong>
                    </div>
                    <div className="admin-summary-item">
                      <span>Tài khoản Trưởng tộc:</span>
                      <strong>@{wizardData.managerUsername}</strong>
                    </div>
                    <div className="admin-summary-item">
                      <span>Gói kích hoạt:</span>
                      <strong>{wizardData.planName}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              {wizardStep > 1 && (
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setWizardStep((prev) => (prev - 1) as 1 | 2 | 3)}
                >
                  ← Quay lại
                </button>
              )}

              {wizardStep < 3 && (
                <button
                  type="button"
                  className="btn-modal-approve"
                  onClick={() => {
                    if (wizardStep === 1 && (!wizardData.familyName || !wizardData.province)) {
                      toast.error('Lỗi', 'Vui lòng điền đủ tên dòng họ và tỉnh thành.');
                      return;
                    }
                    if (wizardStep === 2 && (!wizardData.managerName || !wizardData.managerUsername || !wizardData.managerEmail)) {
                      toast.error('Lỗi', 'Vui lòng điền đủ họ tên, username và email trưởng tộc.');
                      return;
                    }
                    setWizardStep((prev) => (prev + 1) as 1 | 2 | 3);
                  }}
                >
                  Tiếp theo →
                </button>
              )}

              {wizardStep === 3 && (
                <button
                  type="button"
                  className="btn-modal-create"
                  onClick={handleCompleteWizard}
                >
                  Xác Nhận Khởi Tạo Không Gian & Cấp Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Kích hoạt / Mở khóa (M04 - FR-SA-10, FR-SA-12) */}
      {isActivateModalOpen && selectedBiz && (
        <div className="admin-modal-backdrop" onClick={() => setIsActivateModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">KÍCH HOẠT VẬN HÀNH</span>
                <h3 className="admin-modal-title">Kích Hoạt Không Gian Dòng Họ</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsActivateModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <p className="admin-confirm-desc">
                Bạn chuẩn bị kích hoạt / khôi phục quyền truy cập cho <strong>{selectedBiz.name}</strong> ({selectedBiz.code}).
              </p>

              <div className="admin-activation-check-list">
                <div className="admin-check-item success">
                  <span className="check-icon">✓</span>
                  <span>Hồ sơ dòng họ hợp lệ và đã thẩm định</span>
                </div>
                <div className="admin-check-item success">
                  <span className="check-icon">✓</span>
                  <span>Tài khoản Trưởng tộc đã được khởi tạo (@{selectedBiz.account_username})</span>
                </div>
                <div className="admin-check-item success">
                  <span className="check-icon">✓</span>
                  <span>Gói dịch vụ đã sẵn sàng ({selectedBiz.plan_name})</span>
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setIsActivateModalOpen(false)}>
                Hủy bỏ
              </button>
              <button className="btn-modal-approve" onClick={handleConfirmActivate}>
                Xác Nhận Kích Hoạt (ACTIVE)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tạm ngưng Business (M04 - FR-SA-11) */}
      {isSuspendModalOpen && selectedBiz && (
        <div className="admin-modal-backdrop" onClick={() => setIsSuspendModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">TẠM NGƯNG VẬN HÀNH</span>
                <h3 className="admin-modal-title">Tạm Ngưng Dòng Họ</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsSuspendModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmSuspend}>
              <div className="admin-modal-body">
                <p className="admin-confirm-desc">
                  Thao tác này sẽ khóa quyền chỉnh sửa dữ liệu của các thành viên trong dòng họ <strong>{selectedBiz.name}</strong>. Dữ liệu gia phả vẫn được bảo toàn nguyên vẹn 100%.
                </p>

                <div className="form-group">
                  <label className="form-label required">Lý do tạm ngưng hoạt động:</label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="Ví dụ: Chưa thanh toán phí duy trì gói quá hạn, vi phạm bản quyền gia phả..."
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="btn-modal-cancel" onClick={() => setIsSuspendModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-reject-confirm">
                  Xác Nhận Tạm Ngưng (SUSPENDED)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quản lý Subscription & Hạn mức (M06 - FR-SA-15) */}
      {isSubModalOpen && selectedBiz && (
        <div className="admin-modal-backdrop" onClick={() => setIsSubModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h3 className="admin-modal-title">Quản Lý Gói & Hạn Mức Dòng Họ</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsSubModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-sub-action-tabs">
                <button
                  type="button"
                  className={`admin-sub-tab ${subAction === 'RENEW' ? 'active' : ''}`}
                  onClick={() => setSubAction('RENEW')}
                >
                  Gia Hạn Kỳ Hạn
                </button>
                <button
                  type="button"
                  className={`admin-sub-tab ${subAction === 'CHANGE_PLAN' ? 'active' : ''}`}
                  onClick={() => setSubAction('CHANGE_PLAN')}
                >
                  Nâng Cấp / Hạ Cấp Gói
                </button>
              </div>

              {subAction === 'RENEW' && (
                <div className="admin-sub-renew-box">
                  <div className="form-group">
                    <label className="form-label">Gói hiện tại:</label>
                    <div className="admin-strong-text">{selectedBiz.plan_name} (Hết hạn: {selectedBiz.expires_at})</div>
                  </div>

                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label className="form-label required">Thời gian gia hạn thêm:</label>
                    <select
                      className="admin-search-input-field"
                      value={renewMonths}
                      onChange={(e) => setRenewMonths(Number(e.target.value))}
                    >
                      <option value={6}>Gia hạn 6 tháng</option>
                      <option value={12}>Gia hạn 12 tháng (1 năm)</option>
                      <option value={24}>Gia hạn 24 tháng (2 năm)</option>
                      <option value={36}>Gia hạn 36 tháng (3 năm)</option>
                    </select>
                  </div>
                </div>
              )}

              {subAction === 'CHANGE_PLAN' && (
                <div className="admin-sub-change-box">
                  <div className="form-group">
                    <label className="form-label required">Chọn gói dịch vụ mục tiêu:</label>
                    <select
                      className="admin-search-input-field"
                      value={targetPlanId}
                      onChange={(e) => setTargetPlanId(e.target.value)}
                    >
                      <option value="PLAN-ENT">Gói Đại Gia Tộc (Enterprise) - 3,000 thành viên, 100GB (5,000,000 đ/năm)</option>
                      <option value="PLAN-ADV">Gói Nâng Cao (Advanced) - 1,000 thành viên, 50GB (2,900,000 đ/năm)</option>
                      <option value="PLAN-PRO">Gói Tiêu Chuẩn (Pro) - 500 thành viên, 20GB (1,800,000 đ/năm)</option>
                    </select>
                  </div>

                  <div className="admin-diff-preview-card">
                    <h5 className="admin-diff-title">So sánh thay đổi quyền lợi (Preview Diff):</h5>
                    <div className="admin-diff-grid">
                      <div className="admin-diff-col">
                        <span className="admin-diff-label">Hiện tại ({selectedBiz.plan_name}):</span>
                        <ul>
                          <li>Hạn mức: {selectedBiz.members_limit} thành viên</li>
                          <li>Lưu trữ: {selectedBiz.storage_limit_gb} GB</li>
                        </ul>
                      </div>
                      <div className="admin-diff-col highlight">
                        <span className="admin-diff-label">Gói mới:</span>
                        <ul>
                          <li>Hạn mức: {targetPlanId === 'PLAN-ENT' ? '3,000' : targetPlanId === 'PLAN-ADV' ? '1,000' : '500'} thành viên</li>
                          <li>Lưu trữ: {targetPlanId === 'PLAN-ENT' ? '100' : targetPlanId === 'PLAN-ADV' ? '50' : '20'} GB</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setIsSubModalOpen(false)}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-modal-approve"
                onClick={handleConfirmSubscription}
              >
                Xác Nhận Cập Nhật Gói
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBusinessesMgmt;
