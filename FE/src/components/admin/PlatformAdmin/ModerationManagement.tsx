import React, { useEffect, useMemo, useState } from 'react';
import {
  initialModerationReports,
  type ModerationContentType,
  type ModerationPriority,
  type ModerationReport,
  type ModerationStatus,
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
  useAdminToast,
} from './shared';
import './PlatformAdmin.css';

const PAGE_SIZE = 4;

type ModerationAction = 'approve' | 'reject' | 'hide' | 'resolve';

interface PendingModerationAction {
  report: ModerationReport;
  action: ModerationAction;
}

const actionCopy: Record<ModerationAction, { title: string; label: string; message: string; tone: 'primary' | 'danger' }> = {
  approve: {
    title: 'Phê duyệt Báo cáo?',
    label: 'Phê duyệt',
    message: 'Báo cáo sẽ được tiếp nhận và chuyển sang trạng thái đang xử lý.',
    tone: 'primary',
  },
  reject: {
    title: 'Từ chối Báo cáo?',
    label: 'Từ chối',
    message: 'Báo cáo sẽ được đóng vì không đủ căn cứ xử lý.',
    tone: 'danger',
  },
  hide: {
    title: 'Ẩn Nội dung bị báo cáo?',
    label: 'Ẩn nội dung',
    message: 'Nội dung sẽ bị ẩn khỏi người dùng trong khi đội ngũ kiểm duyệt tiếp tục xem xét.',
    tone: 'danger',
  },
  resolve: {
    title: 'Đánh dấu Đã giải quyết?',
    label: 'Hoàn tất xử lý',
    message: 'Hồ sơ kiểm duyệt sẽ chuyển sang trạng thái đã giải quyết.',
    tone: 'primary',
  },
};

export const ModerationManagement: React.FC = () => {
  const [reports, setReports] = useState<ModerationReport[]>(() => initialModerationReports.map((item) => ({ ...item })));
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ModerationStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | ModerationPriority>('all');
  const [contentFilter, setContentFilter] = useState<'all' | ModerationContentType>('all');
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<ModerationReport | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingModerationAction | null>(null);
  const { toast, showToast, dismissToast } = useAdminToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 340);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => setPage(1), [searchQuery, statusFilter, priorityFilter, contentFilter]);

  const filteredReports = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return reports.filter((item) => {
      const matchesSearch = !needle || [item.id, item.contentTitle, item.reportedUser, item.reporter, item.reason]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesSearch
        && (statusFilter === 'all' || item.status === statusFilter)
        && (priorityFilter === 'all' || item.priority === priorityFilter)
        && (contentFilter === 'all' || item.contentType === contentFilter);
    });
  }, [reports, searchQuery, statusFilter, priorityFilter, contentFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleReports = filteredReports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openAction = (report: ModerationReport, action: ModerationAction) => {
    setPendingAction({ report, action });
  };

  const applyAction = () => {
    if (!pendingAction) return;
    const { report, action } = pendingAction;
    const update = (item: ModerationReport): ModerationReport => {
      if (item.id !== report.id) return item;
      if (action === 'approve') return { ...item, status: 'reviewing' };
      if (action === 'reject') return { ...item, status: 'rejected' };
      if (action === 'hide') return { ...item, contentHidden: true, status: item.status === 'pending' ? 'reviewing' : item.status };
      return { ...item, status: 'resolved' };
    };

    setReports((current) => current.map(update));
    setSelectedReport((current) => current ? update(current) : current);
    const messages: Record<ModerationAction, string> = {
      approve: `Đã tiếp nhận báo cáo ${report.id}.`,
      reject: `Đã từ chối báo cáo ${report.id}.`,
      hide: `Đã ẩn nội dung trong báo cáo ${report.id}.`,
      resolve: `Đã hoàn tất xử lý báo cáo ${report.id}.`,
    };
    showToast(messages[action], action === 'reject' || action === 'hide' ? 'info' : 'success');
    setPendingAction(null);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setContentFilter('all');
  };

  const hasFilters = Boolean(searchQuery || statusFilter !== 'all' || priorityFilter !== 'all' || contentFilter !== 'all');

  return (
    <section className="s6a-page">
      <AdminToast toast={toast} onDismiss={dismissToast} />
      <AdminPageHeader
        eyebrow="AN TOÀN CỘNG ĐỒNG"
        title="Trung tâm Kiểm duyệt"
        description="Xem xét báo cáo, bảo vệ nội dung gia phả và duy trì không gian cộng đồng trang trọng."
        actions={<button type="button" className="s6a-button secondary" onClick={() => { setStatusFilter('pending'); setPriorityFilter('high'); }}>Xem việc ưu tiên</button>}
      />

      <div className="s6a-metric-grid four">
        <article className="s6a-metric-card"><span>Chờ tiếp nhận</span><strong>{reports.filter((item) => item.status === 'pending').length}</strong><small>Báo cáo mới</small></article>
        <article className="s6a-metric-card"><span>Đang xử lý</span><strong>{reports.filter((item) => item.status === 'reviewing').length}</strong><small>Đã có điều phối viên</small></article>
        <article className="s6a-metric-card"><span>Nội dung đang ẩn</span><strong>{reports.filter((item) => item.contentHidden).length}</strong><small>Chờ hoặc đã xử lý</small></article>
        <article className="s6a-metric-card"><span>Đã giải quyết</span><strong>{reports.filter((item) => item.status === 'resolved').length}</strong><small>Đã hoàn tất xử lý</small></article>
      </div>

      <div className="s6a-content-card">
        <div className="s6a-card-heading">
          <div><h2>Danh sách Báo cáo</h2><p>Ưu tiên nội dung nhạy cảm và các báo cáo ảnh hưởng quyền riêng tư.</p></div>
          <span className="s6a-count-pill">{filteredReports.length} báo cáo</span>
        </div>

        <div className="s6a-filter-bar s6a-filter-grid moderation">
          <label className="s6a-search-field wide"><span>Tìm kiếm</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Mã báo cáo, nội dung, tài khoản..." /></label>
          <label><span>Trạng thái</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ModerationStatus)}><option value="all">Tất cả</option><option value="pending">Đang chờ</option><option value="reviewing">Đang xử lý</option><option value="resolved">Đã giải quyết</option><option value="rejected">Đã từ chối</option></select></label>
          <label><span>Ưu tiên</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as 'all' | ModerationPriority)}><option value="all">Tất cả</option><option value="high">Cao</option><option value="medium">Vừa</option><option value="low">Thấp</option></select></label>
          <label><span>Loại nội dung</span><select value={contentFilter} onChange={(event) => setContentFilter(event.target.value as 'all' | ModerationContentType)}><option value="all">Tất cả loại</option><option value="Hồ sơ thành viên">Hồ sơ thành viên</option><option value="Lời tưởng niệm">Lời tưởng niệm</option><option value="Tư liệu số">Tư liệu số</option><option value="Bình luận sự kiện">Bình luận sự kiện</option></select></label>
          <button type="button" className="s6a-button ghost align-end" onClick={resetFilters} disabled={!hasFilters}>Đặt lại</button>
        </div>

        {loading ? (
          <AdminStatePanel kind="loading" message="Đang tải hàng đợi kiểm duyệt..." />
        ) : visibleReports.length === 0 ? (
          <AdminStatePanel kind="empty" title="Không có báo cáo phù hợp" message="Hàng đợi hiện không có mục đáp ứng bộ lọc đã chọn." action={<button type="button" className="s6a-button secondary" onClick={resetFilters}>Xóa bộ lọc</button>} />
        ) : (
          <>
            <div className="s6a-table-wrap">
              <table className="s6a-table">
                <thead><tr><th>Báo cáo</th><th>Nội dung</th><th>Người bị báo cáo</th><th>Lý do</th><th>Thời gian</th><th>Ưu tiên</th><th>Trạng thái</th><th className="s6a-actions-column">Thao tác</th></tr></thead>
                <tbody>
                  {visibleReports.map((item) => (
                    <tr key={item.id}>
                      <td><button type="button" className="s6a-table-id" onClick={() => setSelectedReport(item)}>{item.id}</button><span className="s6a-table-subline">Bởi {item.reporter}</span></td>
                      <td><div className="s6a-primary-cell"><strong>{item.contentType}</strong><span>{item.contentTitle}</span></div>{item.contentHidden && <AdminStatusBadge status="hidden" />}</td>
                      <td>{item.reportedUser}</td>
                      <td>{item.reason}</td>
                      <td>{formatAdminDate(item.createdAt, true)}</td>
                      <td><AdminStatusBadge status={item.priority} /></td>
                      <td><AdminStatusBadge status={item.status} /></td>
                      <td><button type="button" className="s6a-link-button" onClick={() => setSelectedReport(item)}>Xem & xử lý</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={safePage} totalItems={filteredReports.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      <AdminModal
        open={Boolean(selectedReport)}
        title="Chi tiết Báo cáo Kiểm duyệt"
        description={selectedReport?.id}
        onClose={() => setSelectedReport(null)}
        size="lg"
        footer={selectedReport && (
          <div className="s6a-moderation-actions">
            <button type="button" className="s6a-button secondary" onClick={() => setSelectedReport(null)}>Đóng</button>
            <button type="button" className="s6a-button secondary" onClick={() => openAction(selectedReport, 'approve')} disabled={selectedReport.status !== 'pending'}>Phê duyệt</button>
            <button type="button" className="s6a-button secondary" onClick={() => openAction(selectedReport, 'reject')} disabled={selectedReport.status === 'resolved' || selectedReport.status === 'rejected'}>Từ chối</button>
            <button type="button" className="s6a-button danger" onClick={() => openAction(selectedReport, 'hide')} disabled={selectedReport.contentHidden}>Ẩn nội dung</button>
            <button type="button" className="s6a-button primary" onClick={() => openAction(selectedReport, 'resolve')} disabled={selectedReport.status === 'resolved' || selectedReport.status === 'rejected'}>Giải quyết</button>
          </div>
        )}
      >
        {selectedReport && (
          <div className="s6a-detail-layout">
            <div className="s6a-detail-banner moderation">
              <div><span>Loại nội dung</span><strong>{selectedReport.contentType}</strong></div>
              <div className="s6a-inline-badges"><AdminStatusBadge status={selectedReport.priority} /><AdminStatusBadge status={selectedReport.status} />{selectedReport.contentHidden && <AdminStatusBadge status="hidden" />}</div>
            </div>
            <div className="s6a-detail-grid">
              <div><span>Nội dung</span><strong>{selectedReport.contentTitle}</strong></div>
              <div><span>Người bị báo cáo</span><strong>{selectedReport.reportedUser}</strong></div>
              <div><span>Người báo cáo</span><strong>{selectedReport.reporter}</strong></div>
              <div><span>Thời điểm gửi</span><strong>{formatAdminDate(selectedReport.createdAt, true)}</strong></div>
            </div>
            <div className="s6a-detail-section"><h3>Lý do báo cáo</h3><p><strong>{selectedReport.reason}</strong></p><p>{selectedReport.description}</p></div>
            <div className={`s6a-content-preview ${selectedReport.contentHidden ? 'hidden' : ''}`}>
              <span>Xem trước nội dung</span>
              <p>{selectedReport.contentHidden ? 'Nội dung này hiện đã được ẩn khỏi cộng đồng.' : `“${selectedReport.contentTitle}” đang hiển thị trong phạm vi chia sẻ của dòng họ.`}</p>
            </div>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction ? actionCopy[pendingAction.action].title : ''}
        message={pendingAction ? `${actionCopy[pendingAction.action].message} Mã: ${pendingAction.report.id}` : ''}
        confirmLabel={pendingAction ? actionCopy[pendingAction.action].label : 'Xác nhận'}
        tone={pendingAction ? actionCopy[pendingAction.action].tone : 'primary'}
        onCancel={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
    </section>
  );
};

export default ModerationManagement;
