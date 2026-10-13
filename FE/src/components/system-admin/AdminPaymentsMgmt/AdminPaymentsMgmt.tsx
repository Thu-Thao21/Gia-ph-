import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminPaymentsMgmt.css';

export interface PaymentTransactionItem {
  id: string;
  gateway_code: string;
  family_name: string;
  family_code: string;
  plan_name: string;
  amount_vnd: number;
  payment_method: 'VNPAY' | 'VIETQR' | 'BANK_TRANSFER' | 'MOMO';
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED';
  invoice_id?: string;
  created_at: string;
  notes?: string;
}

const INITIAL_PAYMENTS: PaymentTransactionItem[] = [];

export const AdminPaymentsMgmt: React.FC = () => {
  const [payments, setPayments] = useState<PaymentTransactionItem[]>(INITIAL_PAYMENTS);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTxn, setSelectedTxn] = useState<PaymentTransactionItem | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const toast = useToast();

  const handleOpenInvoice = (txn: PaymentTransactionItem) => {
    setSelectedTxn(txn);
    setIsInvoiceModalOpen(true);
  };

  const handlePrintInvoice = () => {
    toast.loading('Đang chuẩn bị in...', 'Hệ thống đang trích xuất dữ liệu hóa đơn điện tử.');
    setTimeout(() => {
      toast.success('Sẵn sàng in hóa đơn', 'Hóa đơn đã được hiển thị trên giao diện in ấn hệ thống.');
    }, 800);
  };

  // Filter
  const filtered = payments.filter((p) => {
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
    const matchSearch =
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.gateway_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.plan_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalRevenue = payments
    .filter((p) => p.status === 'SUCCESS')
    .reduce((sum, item) => sum + item.amount_vnd, 0);

  return (
    <div className="admin-payments-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản Lý Giao Dịch & Hóa Đơn Điện Tử</h2>
          <p className="admin-account-subtitle">
            Theo dõi dòng tiền đăng ký/gia hạn gói dòng họ, kiểm soát cổng thanh toán đối tác và xuất hóa đơn tài chính.
          </p>
        </div>

        <div className="admin-revenue-summary-pill">
          <span className="summary-label">Doanh thu ghi nhận (SUCCESS):</span>
          <strong className="summary-val">{totalRevenue.toLocaleString('vi-VN')} VNĐ</strong>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="admin-biz-bar">
        <div className="admin-biz-pills">
          <button
            className={`admin-pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả ({payments.length})
          </button>
          <button
            className={`admin-pill-btn approved ${statusFilter === 'SUCCESS' ? 'active' : ''}`}
            onClick={() => setStatusFilter('SUCCESS')}
          >
            Thành công ({payments.filter((p) => p.status === 'SUCCESS').length})
          </button>
          <button
            className={`admin-pill-btn pending ${statusFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PENDING')}
          >
            Đang xử lý ({payments.filter((p) => p.status === 'PENDING').length})
          </button>
          <button
            className={`admin-pill-btn rejected ${statusFilter === 'FAILED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('FAILED')}
          >
            Thất bại ({payments.filter((p) => p.status === 'FAILED').length})
          </button>
          <button
            className={`admin-pill-btn ${statusFilter === 'REFUNDED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('REFUNDED')}
          >
            Đã hoàn tiền ({payments.filter((p) => p.status === 'REFUNDED').length})
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
            placeholder="Tìm theo mã giao dịch, dòng họ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Mã Giao Dịch</th>
              <th>Dòng Họ / Khách Hàng</th>
              <th>Gói Dịch Vụ</th>
              <th>Số Tiền</th>
              <th>Cổng Thanh Toán</th>
              <th>Thời Gian</th>
              <th>Trạng Thái</th>
              <th style={{ textAlign: 'right' }}>Hóa Đơn</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-table-empty">
                  Không tìm thấy giao dịch nào.
                </td>
              </tr>
            ) : (
              filtered.map((txn) => (
                <tr key={txn.id} className="admin-table-row">
                  <td>
                    <span className="admin-code-tag">{txn.id}</span>
                    <div className="admin-sub-info">{txn.gateway_code}</div>
                  </td>
                  <td>
                    <div className="admin-strong-text">{txn.family_name}</div>
                    <div className="admin-sub-info">{txn.family_code}</div>
                  </td>
                  <td>
                    <span className="admin-plan-badge">{txn.plan_name}</span>
                  </td>
                  <td>
                    <div className="txn-amount-val">{txn.amount_vnd.toLocaleString('vi-VN')} đ</div>
                  </td>
                  <td>
                    <span className="method-pill">{txn.payment_method}</span>
                  </td>
                  <td>{txn.created_at}</td>
                  <td>
                    {txn.status === 'SUCCESS' && <span className="status-badge status-approved">Thành công</span>}
                    {txn.status === 'PENDING' && <span className="status-badge status-pending">Đang chờ</span>}
                    {txn.status === 'FAILED' && <span className="status-badge status-rejected">Thất bại</span>}
                    {txn.status === 'REFUNDED' && <span className="status-badge" style={{ background: '#e2e8f0', color: '#475569' }}>Đã hoàn</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {txn.status === 'SUCCESS' ? (
                      <button
                        className="btn-view-invoice"
                        title="Xem hóa đơn điện tử"
                        onClick={() => handleOpenInvoice(txn)}
                      >
                        📄 Hóa Đơn
                      </button>
                    ) : (
                      <span className="admin-sub-info">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Modal Preview */}
      {isInvoiceModalOpen && selectedTxn && (
        <div className="admin-modal-backdrop" onClick={() => setIsInvoiceModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag">HÓA ĐƠN ĐIỆN TỬ HỢP LỆ</span>
                <h3 className="admin-modal-title">Hóa Đơn Dịch Vụ: {selectedTxn.invoice_id || 'INV-2026'}</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsInvoiceModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <div className="invoice-box-printable">
                <div className="invoice-header-row">
                  <div>
                    <h4 className="invoice-brand">NỀN TẢNG GIA PHẢ ĐA DÒNG HỌ MFGMS AI</h4>
                    <p className="invoice-sub-addr">Tầng 12, Tòa Nhà Công Nghệ Số, Cầu Giấy, TP. Hà Nội</p>
                    <p className="invoice-sub-addr">Mã số thuế: 0109988776 • Hotline: 1900 6868</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="invoice-id-big">{selectedTxn.invoice_id}</span>
                    <p className="invoice-date-text">Ngày lập: {selectedTxn.created_at}</p>
                  </div>
                </div>

                <div className="invoice-client-row">
                  <div>
                    <span className="invoice-label">Đơn vị thanh toán (Khách hàng):</span>
                    <strong className="invoice-val">{selectedTxn.family_name}</strong>
                    <p className="invoice-sub-code">Mã dòng họ: {selectedTxn.family_code}</p>
                  </div>
                  <div>
                    <span className="invoice-label">Phương thức thanh toán:</span>
                    <strong className="invoice-val">{selectedTxn.payment_method}</strong>
                    <p className="invoice-sub-code">Mã giao dịch: {selectedTxn.gateway_code}</p>
                  </div>
                </div>

                <table className="invoice-items-table">
                  <thead>
                    <tr>
                      <th>Diễn giải dịch vụ</th>
                      <th>Kỳ hạn</th>
                      <th style={{ textAlign: 'right' }}>Đơn giá</th>
                      <th style={{ textAlign: 'right' }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>{selectedTxn.plan_name}</strong>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Phí bản quyền phần mềm quản trị gia phả trực tuyến</div>
                      </td>
                      <td>12 Tháng</td>
                      <td style={{ textAlign: 'right' }}>{selectedTxn.amount_vnd.toLocaleString('vi-VN')} đ</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{selectedTxn.amount_vnd.toLocaleString('vi-VN')} đ</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Tổng tiền thanh toán (Đã gồm VAT):</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#16a34a' }}>
                        {selectedTxn.amount_vnd.toLocaleString('vi-VN')} VNĐ
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <div className="invoice-sign-box">
                  <div className="stamp-box">
                    <span className="stamp-circle">ĐÃ THANH TOÁN (PAID)</span>
                    <small>Hóa đơn điện tử có giá trị pháp lý theo Nghị định 123/2020/NĐ-CP</small>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setIsInvoiceModalOpen(false)}>
                Đóng
              </button>
              <button className="btn-modal-approve" onClick={handlePrintInvoice}>
                🖨️ In / Tải Hóa Đơn PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPaymentsMgmt;
