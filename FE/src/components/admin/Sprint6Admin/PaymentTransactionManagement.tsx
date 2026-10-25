import React, { useEffect, useMemo, useState } from 'react';
import {
  initialPaymentTransactions,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentTransaction,
} from './mockData';
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
import './Sprint6Admin.css';

const PAGE_SIZE = 5;

type PaymentAction = 'confirm' | 'refund';

interface PendingPaymentAction {
  transaction: PaymentTransaction;
  action: PaymentAction;
}

export const PaymentTransactionManagement: React.FC = () => {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>(() => initialPaymentTransactions.map((item) => ({ ...item })));
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [detailTransaction, setDetailTransaction] = useState<PaymentTransaction | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingPaymentAction | null>(null);
  const { toast, showToast, dismissToast } = useAdminToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 360);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => setPage(1), [searchQuery, statusFilter, methodFilter, dateFrom, dateTo]);

  const filteredTransactions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return transactions.filter((item) => {
      const matchesSearch = !needle || [item.id, item.userName, item.userEmail, item.familyName, item.packageName, item.reference]
        .some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesMethod = methodFilter === 'all' || item.method === methodFilter;
      const itemDate = item.createdAt.slice(0, 10);
      const matchesFrom = !dateFrom || itemDate >= dateFrom;
      const matchesTo = !dateTo || itemDate <= dateTo;
      return matchesSearch && matchesStatus && matchesMethod && matchesFrom && matchesTo;
    });
  }, [transactions, searchQuery, statusFilter, methodFilter, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleTransactions = filteredTransactions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const successfulRevenue = transactions
    .filter((item) => item.status === 'success')
    .reduce((sum, item) => sum + item.amount, 0);
  const pendingAmount = transactions
    .filter((item) => item.status === 'pending')
    .reduce((sum, item) => sum + item.amount, 0);

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMethodFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const openAction = (transaction: PaymentTransaction, action: PaymentAction) => {
    setPendingAction({ transaction, action });
  };

  const applyAction = () => {
    if (!pendingAction) return;
    const nextStatus: PaymentStatus = pendingAction.action === 'refund' ? 'refunded' : 'success';
    setTransactions((current) => current.map((item) => item.id === pendingAction.transaction.id
      ? {
          ...item,
          status: nextStatus,
          note: pendingAction.action === 'refund'
            ? `${item.note} Hoàn tiền lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.`
            : `${item.note} Đã đối soát thủ công.`,
        }
      : item));
    if (detailTransaction?.id === pendingAction.transaction.id) {
      setDetailTransaction((current) => current ? { ...current, status: nextStatus } : current);
    }
    showToast(
      pendingAction.action === 'refund'
        ? `Đã hoàn tiền giao dịch ${pendingAction.transaction.id}.`
        : `Đã xác nhận giao dịch ${pendingAction.transaction.id}.`,
      pendingAction.action === 'refund' ? 'info' : 'success'
    );
    setPendingAction(null);
  };

  const hasFilters = Boolean(searchQuery || dateFrom || dateTo || statusFilter !== 'all' || methodFilter !== 'all');

  return (
    <section className="s6a-page">
      <AdminToast toast={toast} onDismiss={dismissToast} />
      <AdminPageHeader
        eyebrow="TÀI CHÍNH NỀN TẢNG"
        title="Quản lý Thanh toán & Giao dịch"
        description="Theo dõi, đối soát và xử lý trạng thái các giao dịch đăng ký gói dịch vụ."
        actions={<button type="button" className="s6a-button secondary" onClick={() => showToast('Đã xuất báo cáo đối soát giao dịch.', 'info')}>Xuất báo cáo</button>}
      />

      <div className="s6a-metric-grid four">
        <article className="s6a-metric-card"><span>Tổng giao dịch</span><strong>{transactions.length}</strong><small>Trong hệ thống</small></article>
        <article className="s6a-metric-card"><span>Doanh thu thành công</span><strong>{formatVnd(successfulRevenue)}</strong><small>Không gồm khoản hoàn tiền</small></article>
        <article className="s6a-metric-card"><span>Chờ đối soát</span><strong>{formatVnd(pendingAmount)}</strong><small>{transactions.filter((item) => item.status === 'pending').length} giao dịch</small></article>
        <article className="s6a-metric-card"><span>Tỷ lệ thành công</span><strong>{Math.round((transactions.filter((item) => item.status === 'success').length / transactions.length) * 100)}%</strong><small>Theo trạng thái hiện tại</small></article>
      </div>

      <div className="s6a-content-card">
        <div className="s6a-card-heading">
          <div><h2>Lịch sử giao dịch</h2><p>Tìm kiếm theo mã, người dùng, dòng họ hoặc mã tham chiếu.</p></div>
          <span className="s6a-count-pill">{filteredTransactions.length} kết quả</span>
        </div>

        <div className="s6a-filter-bar s6a-filter-grid">
          <label className="s6a-search-field wide">
            <span>Tìm kiếm</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Mã giao dịch, người dùng, dòng họ..." />
          </label>
          <label><span>Trạng thái</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PaymentStatus)}><option value="all">Tất cả</option><option value="pending">Đang chờ</option><option value="success">Thành công</option><option value="failed">Thất bại</option><option value="refunded">Đã hoàn tiền</option></select></label>
          <label><span>Phương thức</span><select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value as 'all' | PaymentMethod)}><option value="all">Tất cả</option><option value="VNPay">VNPay</option><option value="MoMo">MoMo</option><option value="Chuyển khoản">Chuyển khoản</option><option value="Thẻ quốc tế">Thẻ quốc tế</option></select></label>
          <label><span>Từ ngày</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label><span>Đến ngày</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button type="button" className="s6a-button ghost align-end" onClick={resetFilters} disabled={!hasFilters}>Đặt lại</button>
        </div>

        {dateFrom && dateTo && dateFrom > dateTo ? (
          <AdminStatePanel kind="error" title="Khoảng ngày không hợp lệ" message="Ngày bắt đầu phải trước hoặc trùng ngày kết thúc." action={<button type="button" className="s6a-button secondary" onClick={() => setDateTo('')}>Xóa ngày kết thúc</button>} />
        ) : loading ? (
          <AdminStatePanel kind="loading" message="Đang tổng hợp giao dịch và dữ liệu đối soát..." />
        ) : visibleTransactions.length === 0 ? (
          <AdminStatePanel kind="empty" title="Không có giao dịch phù hợp" message="Thử nới lỏng điều kiện tìm kiếm hoặc khoảng ngày." action={<button type="button" className="s6a-button secondary" onClick={resetFilters}>Xóa bộ lọc</button>} />
        ) : (
          <>
            <div className="s6a-table-wrap">
              <table className="s6a-table">
                <thead><tr><th>Mã giao dịch</th><th>Người thanh toán</th><th>Gói dịch vụ</th><th>Số tiền</th><th>Phương thức</th><th>Thời gian</th><th>Trạng thái</th><th className="s6a-actions-column">Thao tác</th></tr></thead>
                <tbody>
                  {visibleTransactions.map((item) => (
                    <tr key={item.id}>
                      <td><button type="button" className="s6a-table-id" onClick={() => setDetailTransaction(item)}>{item.id}</button><span className="s6a-table-subline">{item.reference}</span></td>
                      <td><div className="s6a-primary-cell"><strong>{item.userName}</strong><span>{item.familyName}</span></div></td>
                      <td>{item.packageName}</td>
                      <td><strong>{formatVnd(item.amount)}</strong></td>
                      <td>{item.method}</td>
                      <td>{formatAdminDate(item.createdAt, true)}</td>
                      <td><AdminStatusBadge status={item.status} /></td>
                      <td>
                        <div className="s6a-row-actions">
                          <button type="button" className="s6a-link-button" onClick={() => setDetailTransaction(item)}>Chi tiết</button>
                          {item.status === 'pending' ? (
                            <button type="button" className="s6a-link-button success-text" onClick={() => openAction(item, 'confirm')}>Xác nhận</button>
                          ) : item.status === 'success' ? (
                            <button type="button" className="s6a-link-button danger-text" onClick={() => openAction(item, 'refund')}>Hoàn tiền</button>
                          ) : (
                            <button type="button" className="s6a-link-button" disabled title="Không có tác vụ phù hợp với trạng thái hiện tại">Không có tác vụ</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={safePage} totalItems={filteredTransactions.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      <AdminModal
        open={Boolean(detailTransaction)}
        title="Chi tiết Giao dịch"
        description={detailTransaction?.id}
        onClose={() => setDetailTransaction(null)}
        size="lg"
        footer={detailTransaction && (
          <>
            <button type="button" className="s6a-button secondary" onClick={() => setDetailTransaction(null)}>Đóng</button>
            {detailTransaction.status === 'pending' && <button type="button" className="s6a-button primary" onClick={() => openAction(detailTransaction, 'confirm')}>Xác nhận thanh toán</button>}
            {detailTransaction.status === 'success' && <button type="button" className="s6a-button danger" onClick={() => openAction(detailTransaction, 'refund')}>Hoàn tiền</button>}
          </>
        )}
      >
        {detailTransaction && (
          <div className="s6a-detail-layout">
            <div className="s6a-detail-banner">
              <div><span>Số tiền</span><strong>{formatVnd(detailTransaction.amount)}</strong></div>
              <AdminStatusBadge status={detailTransaction.status} />
            </div>
            <div className="s6a-detail-grid">
              <div><span>Người thanh toán</span><strong>{detailTransaction.userName}</strong><small>{detailTransaction.userEmail}</small></div>
              <div><span>Dòng họ</span><strong>{detailTransaction.familyName}</strong></div>
              <div><span>Gói dịch vụ</span><strong>{detailTransaction.packageName}</strong></div>
              <div><span>Phương thức</span><strong>{detailTransaction.method}</strong></div>
              <div><span>Mã tham chiếu</span><strong>{detailTransaction.reference}</strong></div>
              <div><span>Thời điểm tạo</span><strong>{formatAdminDate(detailTransaction.createdAt, true)}</strong></div>
            </div>
            <div className="s6a-detail-section"><h3>Ghi chú đối soát</h3><p>{detailTransaction.note}</p></div>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.action === 'refund' ? 'Xác nhận Hoàn tiền?' : 'Xác nhận Thanh toán?'}
        message={pendingAction?.action === 'refund'
          ? `Giao dịch ${pendingAction.transaction.id} trị giá ${formatVnd(pendingAction.transaction.amount)} sẽ chuyển sang trạng thái đã hoàn tiền.`
          : `Giao dịch ${pendingAction?.transaction.id} sẽ được đánh dấu thành công sau khi đối soát.`}
        confirmLabel={pendingAction?.action === 'refund' ? 'Hoàn tiền' : 'Xác nhận'}
        tone={pendingAction?.action === 'refund' ? 'danger' : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
    </section>
  );
};

export default PaymentTransactionManagement;
