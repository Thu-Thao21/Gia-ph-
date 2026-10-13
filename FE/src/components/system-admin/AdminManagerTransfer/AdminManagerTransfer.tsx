import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminManagerTransfer.css';

export interface TransferHistoryItem {
  id: string;
  family_code: string;
  family_name: string;
  old_manager: string;
  new_manager: string;
  reason: string;
  evidence_doc: string;
  processed_by: string;
  processed_at: string;
  status: 'COMPLETED';
}

const INITIAL_TRANSFERS: TransferHistoryItem[] = [];

export const AdminManagerTransfer: React.FC = () => {
  const [history, setHistory] = useState<TransferHistoryItem[]>(INITIAL_TRANSFERS);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [formData, setFormData] = useState({
    familyCode: 'FAM-TRAN-002',
    familyName: 'Dòng Họ Trần Đình (Văn Chỉ)',
    currentManager: 'Trần Đình Quang',
    incidentReason: 'Trưởng tộc qua đời / Mất khả năng hành vi',
    detailDescription: '',
    evidenceFileName: '',
    newManagerName: '',
    newManagerCccd: '',
    newManagerPhone: '',
    newManagerEmail: '',
    revokeOldSessions: true,
  });

  const toast = useToast();

  const handleOpenWizard = () => {
    setFormData({
      familyCode: 'FAM-TRAN-002',
      familyName: 'Dòng Họ Trần Đình (Văn Chỉ)',
      currentManager: 'Trần Đình Quang',
      incidentReason: 'Trưởng tộc qua đời / Mất khả năng hành vi',
      detailDescription: '',
      evidenceFileName: 'Bien-ban-hop-gia-toc-thua-ke.pdf',
      newManagerName: '',
      newManagerCccd: '',
      newManagerPhone: '',
      newManagerEmail: '',
      revokeOldSessions: true,
    });
    setStep(1);
    setIsWizardOpen(true);
  };

  const handleCompleteTransfer = () => {
    const newRecord: TransferHistoryItem = {
      id: `TRF-${new Date().getFullYear()}-00${history.length + 1}`,
      family_code: formData.familyCode,
      family_name: formData.familyName,
      old_manager: formData.currentManager,
      new_manager: `${formData.newManagerName} (${formData.newManagerPhone})`,
      reason: `${formData.incidentReason}: ${formData.detailDescription}`,
      evidence_doc: formData.evidenceFileName || 'Bien-ban-hop-hoi-dong-xac-minh.pdf',
      processed_by: 'Admin Hệ Thống',
      processed_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'COMPLETED',
    };

    setHistory([newRecord, ...history]);
    setIsWizardOpen(false);
    toast.success(
      'Chuyển quyền thành công!',
      `Đã chuyển giao quyền Trưởng tộc của "${formData.familyName}" sang ông/bà "${formData.newManagerName}". Toàn bộ phiên đăng nhập của người cũ đã được thu hồi.`
    );
  };

  return (
    <div className="admin-transfer-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Chuyển Giao Trưởng Tộc (Trường Hợp Đặc Biệt)</h2>
          <p className="admin-account-subtitle">
            Quy trình pháp lý đặc biệt để chuyển quyền quản trị Business Dòng họ khi Trưởng tộc qua đời, mất năng lực hành vi hoặc có tranh chấp ủy quyền hợp pháp.
          </p>
        </div>

        <div className="admin-account-controls">
          <button className="btn-start-transfer" onClick={handleOpenWizard}>
            + Tiếp Nhận & Chuyển Trưởng Tộc Mới
          </button>
        </div>
      </div>

      {/* Notice Card */}
      <div className="admin-transfer-notice-box">
        <div className="notice-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div className="notice-content">
          <strong>Lưu ý nghiệp vụ bắt buộc:</strong>
          <p>
            Chức năng này can thiệp quyền sở hữu tối cao của không gian dòng họ. System Admin bắt buộc phải đối chiếu biên bản họp Hội đồng gia tộc hoặc văn bản xác nhận pháp lý có chữ ký của các thành viên đại diện trước khi phê duyệt chuyển giao.
          </p>
        </div>
      </div>

      {/* History Table */}
      <div className="admin-table-card">
        <div className="admin-table-card-header">
          <h3 className="admin-card-header-title">Nhật Ký Chuyển Giao Trưởng Tộc Đặc Biệt</h3>
          <span className="admin-card-header-sub">Lưu trữ bất biến toàn bộ các quyết định thay đổi người đại diện dòng họ.</span>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Chuyển Giao</th>
              <th>Dòng Họ Áp Dụng</th>
              <th>Người Quản Lý Cũ</th>
              <th>Trưởng Tộc Kế Nhiệm</th>
              <th>Lý Do Sự Cố</th>
              <th>Tài Liệu Xác Minh</th>
              <th>Người Phê Duyệt</th>
              <th>Thời Gian</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id} className="admin-table-row">
                <td>
                  <span className="admin-code-tag">{item.id}</span>
                </td>
                <td>
                  <div className="admin-strong-text">{item.family_name}</div>
                  <div className="admin-sub-info">{item.family_code}</div>
                </td>
                <td>
                  <span className="old-manager-name">{item.old_manager}</span>
                </td>
                <td>
                  <div className="new-manager-name">✓ {item.new_manager}</div>
                </td>
                <td style={{ maxWidth: 260 }}>
                  <div className="transfer-reason-text">{item.reason}</div>
                </td>
                <td>
                  <span className="doc-link-pill">📄 {item.evidence_doc}</span>
                </td>
                <td>{item.processed_by}</td>
                <td>{item.processed_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Wizard Modal 4 Steps */}
      {isWizardOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsWizardOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">QUY TRÌNH 4 BƯỚC</span>
                <h3 className="admin-modal-title">Chuyển Giao Trưởng Tộc Khẩn Cấp</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsWizardOpen(false)}>×</button>
            </div>

            {/* Stepper */}
            <div className="admin-wizard-stepper">
              <div className={`admin-step-item ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
                <span className="admin-step-num">1</span>
                <span className="admin-step-label">Dòng họ & Sự cố</span>
              </div>
              <div className="admin-step-line" />
              <div className={`admin-step-item ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
                <span className="admin-step-num">2</span>
                <span className="admin-step-label">Tài liệu pháp lý</span>
              </div>
              <div className="admin-step-line" />
              <div className={`admin-step-item ${step === 3 ? 'active' : step > 3 ? 'done' : ''}`}>
                <span className="admin-step-num">3</span>
                <span className="admin-step-label">Người kế nhiệm</span>
              </div>
              <div className="admin-step-line" />
              <div className={`admin-step-item ${step === 4 ? 'active' : ''}`}>
                <span className="admin-step-num">4</span>
                <span className="admin-step-label">Xác nhận</span>
              </div>
            </div>

            <div className="admin-modal-body">
              {step === 1 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 1: Chọn Dòng Họ & Tiếp Nhận Sự Cố</h4>
                  <p className="admin-step-desc">Chọn dòng họ cần chuyển giao và xác định căn cứ sự cố phát sinh.</p>

                  <div className="form-group">
                    <label className="form-label required">Dòng Họ Cần Xử Lý:</label>
                    <select
                      className="admin-search-input-field"
                      value={formData.familyCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'FAM-TRAN-002') {
                          setFormData({ ...formData, familyCode: val, familyName: 'Dòng Họ Trần Đình (Văn Chỉ)', currentManager: 'Trần Đình Quang' });
                        } else if (val === 'FAM-NGUYEN-001') {
                          setFormData({ ...formData, familyCode: val, familyName: 'Dòng Họ Nguyễn Văn (Đại Tôn)', currentManager: 'Nguyễn Văn Hùng' });
                        } else {
                          setFormData({ ...formData, familyCode: val, familyName: 'Tộc Lê Khắc (Tràng Kênh)', currentManager: 'Lê Khắc Minh Trí' });
                        }
                      }}
                    >
                      <option value="FAM-TRAN-002">Dòng Họ Trần Đình (Văn Chỉ) - Hiện tại: Trần Đình Quang</option>
                      <option value="FAM-NGUYEN-001">Dòng Họ Nguyễn Văn (Đại Tôn) - Hiện tại: Nguyễn Văn Hùng</option>
                      <option value="FAM-LE-003">Tộc Lê Khắc (Tràng Kênh) - Hiện tại: Lê Khắc Minh Trí</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Loại Sự Cố Cần Chuyển Quyền:</label>
                    <select
                      className="admin-search-input-field"
                      value={formData.incidentReason}
                      onChange={(e) => setFormData({ ...formData, incidentReason: e.target.value })}
                    >
                      <option value="Trưởng tộc qua đời / Mất khả năng hành vi">Trưởng tộc đương nhiệm qua đời / Mất khả năng hành vi</option>
                      <option value="Mất liên lạc hoàn toàn > 6 tháng">Mất liên lạc hoàn toàn & không tham gia điều hành gia phả trên 6 tháng</option>
                      <option value="Nghị quyết bãi miễn của Hội đồng gia tộc">Nghị quyết bãi miễn & chỉ định thay thế của Đại hội đồng gia tộc</option>
                      <option value="Bàn giao tự nguyện có công chứng">Bàn giao tự nguyện có văn bản công chứng / xác nhận địa phương</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Chi tiết mô tả sự cố:</label>
                    <textarea
                      rows={3}
                      className="form-textarea"
                      placeholder="Mô tả tóm tắt bối cảnh và lý do gia tộc đề nghị chuyển giao quyền quản trị..."
                      value={formData.detailDescription}
                      onChange={(e) => setFormData({ ...formData, detailDescription: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 2: Hồ Sơ Tài Liệu Pháp Lý & Xác Minh</h4>
                  <p className="admin-step-desc">Đính kèm biên bản xác minh làm căn cứ pháp lý để lưu vết Audit.</p>

                  <div className="admin-upload-evidence-card">
                    <div className="upload-icon">📁</div>
                    <div className="upload-meta">
                      <strong>Tài liệu biên bản đã tiếp nhận:</strong>
                      <span className="file-name">{formData.evidenceFileName || 'Bien-ban-hop-Hoi-dong-gia-toc-thua-ke.pdf'}</span>
                      <span className="file-size">Dung lượng: 2.4 MB • Chữ ký xác thực của 12 thành viên cốt cán</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Tên tệp hồ sơ / Mã văn bản lưu trữ:</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="Ví dụ: BB-HOP-GIATOC-SO-05-2026.pdf"
                      value={formData.evidenceFileName}
                      onChange={(e) => setFormData({ ...formData, evidenceFileName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-verification-check-card">
                    <label className="checkbox-label">
                      <input type="checkbox" defaultChecked />
                      <span>Tôi xác nhận đã kiểm tra tính toàn vẹn của chữ ký, con dấu và số CCCD của các đại diện dòng họ trong tài liệu này.</span>
                    </label>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 3: Thông Tin Người Tiếp Nhận (Trưởng Tộc Mới)</h4>
                  <p className="admin-step-desc">Khai báo thông tin định danh của người được chỉ định kế thừa quản trị.</p>

                  <div className="form-group">
                    <label className="form-label required">Họ và Tên Trưởng Tộc Mới:</label>
                    <input
                      type="text"
                      className="admin-search-input-field"
                      placeholder="Ví dụ: Trần Đình Hải"
                      value={formData.newManagerName}
                      onChange={(e) => setFormData({ ...formData, newManagerName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="admin-dossier-grid">
                    <div className="form-group">
                      <label className="form-label required">Số CCCD / Định Danh:</label>
                      <input
                        type="text"
                        className="admin-search-input-field"
                        placeholder="12 chữ số CCCD"
                        value={formData.newManagerCccd}
                        onChange={(e) => setFormData({ ...formData, newManagerCccd: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Số Điện Thoại:</label>
                      <input
                        type="text"
                        className="admin-search-input-field"
                        placeholder="09xx xxx xxx"
                        value={formData.newManagerPhone}
                        onChange={(e) => setFormData({ ...formData, newManagerPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Email Đăng Nhập & Khôi Phục Mới:</label>
                    <input
                      type="email"
                      className="admin-search-input-field"
                      placeholder="email@example.com"
                      value={formData.newManagerEmail}
                      onChange={(e) => setFormData({ ...formData, newManagerEmail: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="admin-wizard-step-body">
                  <h4 className="admin-step-title">Bước 4: Xem Lại & Xác Nhận Chuyển Giao Quyền Lực</h4>
                  <p className="admin-step-desc">Hệ thống sẽ ngay lập tức chuyển đổi người quản trị và vô hiệu hóa quyền cũ.</p>

                  <div className="admin-diff-preview-card">
                    <div className="admin-diff-grid">
                      <div className="admin-diff-col">
                        <span className="admin-diff-label">Trưởng tộc hiện tại (Sẽ bị thu hồi):</span>
                        <p style={{ margin: '6px 0', fontWeight: 700, color: '#dc2626' }}>{formData.currentManager}</p>
                        <small>Mọi phiên đăng nhập còn hiệu lực sẽ bị chấm dứt ngay lập tức.</small>
                      </div>
                      <div className="admin-diff-col highlight">
                        <span className="admin-diff-label">Trưởng tộc kế nhiệm (Sẽ nhận quyền):</span>
                        <p style={{ margin: '6px 0', fontWeight: 700, color: '#16a34a' }}>{formData.newManagerName} ({formData.newManagerPhone})</p>
                        <small>Email quản trị: {formData.newManagerEmail}</small>
                      </div>
                    </div>
                  </div>

                  <div className="admin-revocation-warning-box">
                    <strong>Hệ quả tác vụ tự động:</strong>
                    <ul>
                      <li>Thu hồi toàn bộ token đăng nhập của người quản lý cũ.</li>
                      <li>Gửi mã kích hoạt bảo mật và bàn giao không gian về Email và SMS của Trưởng tộc mới.</li>
                      <li>Ghi nhận bản ghi bất biến vào Nhật ký Audit toàn hệ thống.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              {step > 1 && (
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)}
                >
                  ← Quay lại
                </button>
              )}

              {step < 4 && (
                <button
                  type="button"
                  className="btn-modal-approve"
                  onClick={() => {
                    if (step === 1 && !formData.detailDescription) {
                      toast.error('Lỗi', 'Vui lòng nhập mô tả sự cố cần chuyển giao.');
                      return;
                    }
                    if (step === 3 && (!formData.newManagerName || !formData.newManagerPhone || !formData.newManagerEmail)) {
                      toast.error('Lỗi', 'Vui lòng điền đủ họ tên, điện thoại và email người kế nhiệm.');
                      return;
                    }
                    setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
                  }}
                >
                  Tiếp theo →
                </button>
              )}

              {step === 4 && (
                <button
                  type="button"
                  className="btn-modal-reject-confirm"
                  style={{ background: '#b91c1c' }}
                  onClick={handleCompleteTransfer}
                >
                  Xác Nhận & Thực Thi Chuyển Giao Quyền
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminManagerTransfer;
