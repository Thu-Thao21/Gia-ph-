import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeatureEmptyState, FeatureIcon, FeatureModal, FeaturePagination, FeatureToast } from '../common/FeatureUI';
import { fundTransactionMockData, type FundTransactionRecord, type FundTransactionStatus, type FundTransactionType } from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import { useAuth } from '../../context/AuthContext';
import './ClanFundsModule.css';

type TransactionForm = Omit<FundTransactionRecord, 'id'>;
const EMPTY_FORM: TransactionForm = { type: 'income', amount: 0, description: '', party: '', date: '', createdBy: '', status: 'pending' };
const PAGE_SIZE = 8;
const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const displayDate = (value: string) => value.includes('-') ? value.split('-').reverse().join('/') : value;
const inputDate = (value: string) => value.includes('/') ? value.split('/').reverse().join('-') : value;
const dateStamp = (value: string) => new Date(inputDate(value)).getTime() || 0;
const statusLabels: Record<FundTransactionStatus, string> = { confirmed: 'Đã xác nhận', pending: 'Chờ duyệt', cancelled: 'Đã hủy' };

export interface ClanFundsModuleProps {
  canManage?: boolean;
}

export const ClanFundsModule: React.FC<ClanFundsModuleProps> = ({ canManage = false }) => {
  const { account } = useAuth();
  const [transactions, setTransactions] = useLocalPreviewState<FundTransactionRecord[]>('funds', fundTransactionMockData);
  const clanName = account?.clan_name || account?.memberships?.[0]?.clan_name || 'Dòng họ';

  // State cho Admin / Family Admin
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FundTransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FundTransactionStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'newest' | 'amount-high' | 'amount-low'>('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FundTransactionRecord | null>(null);
  const [editing, setEditing] = useState<FundTransactionRecord | 'new' | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<{ item: FundTransactionRecord; action: 'delete' | 'cancel' } | null>(null);
  const [toast, setToast] = useState('');

  // State cho Member quyên góp
  const [donateFundType, setDonateFundType] = useState('Quỹ Khuyến học & Phát triển tài năng');
  const [donateAmount, setDonateAmount] = useState<number | ''>('');
  const [donateSender, setDonateSender] = useState(account?.display_name || '');
  const [donateNote, setDonateNote] = useState('');
  const [donateSuccess, setDonateSuccess] = useState(false);

  // Tính toán số dư và các khoản thu chi thực tế
  const confirmed = useMemo(() => transactions.filter((item) => item.status === 'confirmed'), [transactions]);
  const totalIncome = useMemo(() => confirmed.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0), [confirmed]);
  const totalExpense = useMemo(() => confirmed.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0), [confirmed]);
  const balance = totalIncome - totalExpense;

  const filtered = useMemo(() => transactions.filter((item) => {
    const text = `${item.id} ${item.description} ${item.party} ${item.createdBy}`.toLocaleLowerCase('vi');
    const stamp = dateStamp(item.date);
    return text.includes(search.trim().toLocaleLowerCase('vi')) && (typeFilter === 'all' || item.type === typeFilter) && (statusFilter === 'all' || item.status === statusFilter) && (!fromDate || stamp >= new Date(fromDate).getTime()) && (!toDate || stamp <= new Date(toDate).getTime());
  }).sort((a, b) => sort === 'amount-high' ? b.amount - a.amount : sort === 'amount-low' ? a.amount - b.amount : dateStamp(b.date) - dateStamp(a.date)), [transactions, search, typeFilter, statusFilter, fromDate, toDate, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, typeFilter, statusFilter, fromDate, toDate, sort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  // Danh sách công đức tri ân công khai cho thành viên xem
  const publicDonations = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'income' && t.status === 'confirmed')
      .slice(0, 10);
  }, [transactions]);

  const openForm = (item?: FundTransactionRecord) => {
    if (!canManage) return;
    setEditing(item || 'new');
    setErrors({});
    setForm(item ? { ...item, date: inputDate(item.date) } : { ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10), createdBy: account?.display_name || 'Quản trị viên' });
  };

  const saveTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.amount || form.amount <= 0) nextErrors.amount = 'Số tiền phải lớn hơn 0.';
    if (!form.description.trim()) nextErrors.description = 'Vui lòng nhập nội dung chi / thu.';
    if (!form.party.trim()) nextErrors.party = 'Vui lòng nhập người đóng góp hoặc người nhận.';
    if (!form.date) nextErrors.date = 'Vui lòng chọn ngày giao dịch.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const existing = editing !== 'new' ? editing : null;
    const record: FundTransactionRecord = {
      ...form,
      id: existing?.id || `GD-${String(Date.now()).slice(-6)}`,
      date: displayDate(form.date),
    };
    setTransactions((current) => existing ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
    setEditing(null);
    setSelected(record);
    setToast(existing ? 'Đã cập nhật giao dịch.' : 'Đã ghi nhận giao dịch mới vào sổ quỹ.');
  };

  const confirmAction = () => {
    if (!confirmTarget) return;
    if (confirmTarget.action === 'delete') {
      setTransactions((current) => current.filter((item) => item.id !== confirmTarget.item.id));
    } else {
      setTransactions((current) => current.map((item) => item.id === confirmTarget.item.id ? { ...item, status: 'cancelled' } : item));
    }
    setSelected(null);
    setToast(confirmTarget.action === 'delete' ? 'Đã xóa bản ghi giao dịch.' : 'Đã hủy giao dịch.');
    setConfirmTarget(null);
  };

  // Xử lý gửi xác nhận quyên góp của Thành viên
  const handleMemberDonateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!donateAmount || Number(donateAmount) <= 0) {
      alert('Vui lòng nhập số tiền quyên góp hợp lệ.');
      return;
    }
    if (!donateSender.trim()) {
      alert('Vui lòng nhập họ và tên người đóng góp.');
      return;
    }

    const newRecord: FundTransactionRecord = {
      id: `QG-${String(Date.now()).slice(-6)}`,
      type: 'income',
      amount: Number(donateAmount),
      description: `${donateFundType} - ${donateNote || 'Thành viên đóng góp quỹ'}`,
      party: donateSender.trim(),
      date: new Date().toLocaleDateString('vi-VN'),
      createdBy: account?.display_name || donateSender.trim(),
      status: 'pending', // Chờ Trưởng tộc hoặc Family Admin duyệt
    };

    setTransactions((prev) => [newRecord, ...prev]);
    setDonateSuccess(true);
    setDonateAmount('');
    setDonateNote('');
    setToast('Đã gửi thông tin đóng góp thành công. Trưởng tộc/Family Admin sẽ đối soát và xác nhận vào sổ quỹ.');
  };

  // =========================================================================
  // GIAO DIỆN 1: DÀNH CHO TRƯỞNG TỘC (CLAN ADMIN) & FAMILY ADMIN
  // =========================================================================
  if (canManage) {
    return (
      <section className="family-fund-page" aria-labelledby="fund-title">
        <header className="fund-hero">
          <div>
            <span className="fund-badge">QUẢN LÝ TÀI CHÍNH DÒNG TỘC</span>
            <h1 id="fund-title">Quỹ Dòng Họ & Sổ Cái Thu Chi</h1>
            <p>Trang dành riêng cho Trưởng tộc và Family Admin quản lý số dư, các khoản cần chi và danh sách quyên góp.</p>
          </div>
          <button type="button" className="fund-primary" onClick={() => openForm()}>
            Ghi nhận thu / chi mới
          </button>
        </header>

        {/* 4 Thẻ KPI Tài Chính Tổng Hợp */}
        <div className="fund-kpis">
          <article>
            <span>Số dư quỹ hiện có</span>
            <strong>{formatVnd(balance)}</strong>
            <small>Tổng thu trừ các khoản đã chi</small>
          </article>
          <article className="income">
            <span>Tổng thu (Quyên góp)</span>
            <strong>{formatVnd(totalIncome)}</strong>
            <small>{confirmed.filter((item) => item.type === 'income').length} khoản thu đã xác nhận</small>
          </article>
          <article className="expense">
            <span>Tổng chi (Cần chi & Đã chi)</span>
            <strong>{formatVnd(totalExpense)}</strong>
            <small>{confirmed.filter((item) => item.type === 'expense').length} khoản chi đã thực hiện</small>
          </article>
          <article>
            <span>Đang chờ duyệt</span>
            <strong>{transactions.filter((item) => item.status === 'pending').length} khoản</strong>
            <small>Đóng góp mới gửi về cần đối soát</small>
          </article>
        </div>

        {/* Bảng Danh Sách Giao Dịch Thu Chi */}
        <div className="fund-table-card">
          <div className="fund-table-heading">
            <div>
              <h2>Sổ cái thu chi & Danh sách quyên góp</h2>
              <span>Chi tiết người đóng góp, mục đích cần chi và trạng thái xác nhận</span>
            </div>
            <button type="button" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setFromDate(''); setToDate(''); setSort('newest'); }}>
              Đặt lại bộ lọc
            </button>
          </div>

          <div className="fund-toolbar">
            <label className="fund-search">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm người góp/nhận, nội dung chi..."
              />
            </label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
              <option value="all">Tất cả (Thu & Chi)</option>
              <option value="income">Khoản thu (Quyên góp)</option>
              <option value="expense">Khoản chi (Cần chi)</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="pending">Chờ đối soát</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="newest">Mới nhất</option>
              <option value="amount-high">Số tiền lớn nhất</option>
              <option value="amount-low">Số tiền nhỏ nhất</option>
            </select>
          </div>

          <div className="fund-table-wrap">
            <table className="fund-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Phân loại</th>
                  <th>Nội dung mục đích</th>
                  <th>Người góp / Người nhận</th>
                  <th>Ngày</th>
                  <th>Số tiền</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.id}</strong></td>
                    <td>
                      <span className={`fund-type-badge ${item.type}`}>
                        {item.type === 'income' ? 'Thu / Quyên góp' : 'Khoản chi'}
                      </span>
                    </td>
                    <td><strong>{item.description}</strong></td>
                    <td>{item.party}</td>
                    <td>{item.date}</td>
                    <td className={`fund-amount-val ${item.type}`}>
                      {item.type === 'income' ? '+' : '−'}{formatVnd(item.amount)}
                    </td>
                    <td>
                      <span className={`fund-status-badge ${item.status}`}>
                        {statusLabels[item.status]}
                      </span>
                    </td>
                    <td>
                      <div className="fund-actions">
                        {item.status === 'pending' && (
                          <button
                            type="button"
                            className="fund-btn-approve"
                            title="Xác nhận vào sổ quỹ"
                            onClick={() => {
                              setTransactions((cur) => cur.map((t) => t.id === item.id ? { ...t, status: 'confirmed' } : t));
                              setToast(`Đã duyệt xác nhận khoản đóng góp ${item.id}`);
                            }}
                          >
                            Duyệt
                          </button>
                        )}
                        <button type="button" onClick={() => setSelected(item)} title="Xem chi tiết">
                          Chi tiết
                        </button>
                        <button type="button" onClick={() => openForm(item)} title="Chỉnh sửa">
                          Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className="fund-empty-box">
                <p>Không có giao dịch nào phù hợp với bộ lọc.</p>
              </div>
            )}
          </div>

          <div className="fund-table-footer">
            <span>Hiển thị {visible.length} / {filtered.length} giao dịch</span>
            <FeaturePagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>

        {/* Modal Thêm/Sửa giao dịch */}
        {editing && (
          <FeatureModal
            title={editing === 'new' ? 'Ghi nhận giao dịch quỹ mới' : `Chỉnh sửa ${editing.id}`}
            eyebrow="QUẢN TRỊ TÀI CHÍNH"
            onClose={() => setEditing(null)}
            wide
            footer={
              <>
                <button type="button" className="feature-button secondary" onClick={() => setEditing(null)}>Hủy</button>
                <button type="submit" form="fund-transaction-form" className="feature-button primary">Lưu vào sổ quỹ</button>
              </>
            }
          >
            <form id="fund-transaction-form" className="feature-form-grid" onSubmit={saveTransaction} noValidate>
              <div className="feature-field">
                <label>Loại giao dịch *</label>
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FundTransactionType })}>
                  <option value="income">Khoản thu (Thành viên đóng góp / Tài trợ)</option>
                  <option value="expense">Khoản chi (Tu bổ từ đường, lễ tế, khuyến học...)</option>
                </select>
              </div>
              <div className="feature-field">
                <label>Số tiền (VNĐ) *</label>
                <input
                  type="number"
                  min="1000"
                  value={form.amount || ''}
                  onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
                  placeholder="Nhập số tiền..."
                />
                {errors.amount && <span className="feature-field-error">{errors.amount}</span>}
              </div>
              <div className="feature-field full">
                <label>Nội dung chi tiết / Mục đích *</label>
                <input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Ví dụ: Đóng góp tu bổ từ đường, Chi lễ tế giỗ tổ..."
                />
                {errors.description && <span className="feature-field-error">{errors.description}</span>}
              </div>
              <div className="feature-field">
                <label>Người đóng góp / Người nhận tiền *</label>
                <input
                  value={form.party}
                  onChange={(event) => setForm({ ...form, party: event.target.value })}
                  placeholder="Họ và tên..."
                />
                {errors.party && <span className="feature-field-error">{errors.party}</span>}
              </div>
              <div className="feature-field">
                <label>Ngày giao dịch *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
                {errors.date && <span className="feature-field-error">{errors.date}</span>}
              </div>
              <div className="feature-field">
                <label>Trạng thái</label>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FundTransactionStatus })}>
                  <option value="confirmed">Đã xác nhận</option>
                  <option value="pending">Chờ đối soát</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>
            </form>
          </FeatureModal>
        )}

        {/* Modal Xem chi tiết giao dịch */}
        {selected && (
          <FeatureModal
            title={`Chi tiết giao dịch ${selected.id}`}
            eyebrow="SỔ CÁI DÒNG HỌ"
            onClose={() => setSelected(null)}
            footer={
              <>
                <button type="button" className="feature-button secondary" onClick={() => setSelected(null)}>Đóng</button>
                {selected.status === 'pending' && (
                  <button type="button" className="feature-button danger" onClick={() => setConfirmTarget({ item: selected, action: 'cancel' })}>Hủy giao dịch</button>
                )}
                <button type="button" className="feature-button primary" onClick={() => openForm(selected)}>Chỉnh sửa</button>
              </>
            }
          >
            <div className="fund-detail-box">
              <div className={`fund-detail-header ${selected.type}`}>
                <span>{selected.type === 'income' ? 'Khoản thu / Quyên góp' : 'Khoản chi'}</span>
                <strong>{selected.type === 'income' ? '+' : '−'}{formatVnd(selected.amount)}</strong>
              </div>
              <div className="fund-detail-rows">
                <div><span>Mục đích:</span><strong>{selected.description}</strong></div>
                <div><span>Người góp / nhận:</span><strong>{selected.party}</strong></div>
                <div><span>Ngày giao dịch:</span><strong>{selected.date}</strong></div>
                <div><span>Người ghi nhận:</span><strong>{selected.createdBy || 'Quản trị viên'}</strong></div>
                <div><span>Trạng thái:</span><strong>{statusLabels[selected.status]}</strong></div>
              </div>
              <button type="button" className="fund-delete-btn" onClick={() => setConfirmTarget({ item: selected, action: 'delete' })}>
                Xóa bản ghi này
              </button>
            </div>
          </FeatureModal>
        )}

        {confirmTarget && (
          <ConfirmDialog
            title={confirmTarget.action === 'delete' ? 'Xác nhận xóa giao dịch?' : 'Xác nhận hủy giao dịch?'}
            description={`Giao dịch ${confirmTarget.item.id} (${formatVnd(confirmTarget.item.amount)}) sẽ bị gỡ bỏ khỏi sổ quỹ.`}
            confirmLabel={confirmTarget.action === 'delete' ? 'Xóa vĩnh viễn' : 'Xác nhận hủy'}
            danger
            onCancel={() => setConfirmTarget(null)}
            onConfirm={confirmAction}
          />
        )}
        {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
      </section>
    );
  }

  // =========================================================================
  // GIAO DIỆN 2: DÀNH CHO THÀNH VIÊN (MEMBER) - TRANG QUYÊN GÓP & MÃ QR
  // =========================================================================
  return (
    <section className="family-fund-page member-donate-page" aria-labelledby="member-donate-title">
      <header className="fund-hero">
        <div>
          <span className="fund-badge">ĐÓNG GÓP & CÔNG ĐỨC DÒNG HỌ</span>
          <h1 id="member-donate-title">Quyên Góp Quỹ {clanName}</h1>
          <p>Chung tay vun đắp các hoạt động khuyến học, tu bổ từ đường và nghĩa tình gia tộc.</p>
        </div>
      </header>

      {donateSuccess && (
        <div className="member-donate-success-alert">
          <div>
            <strong>Gửi thông tin đóng góp thành công!</strong>
            <p>Trưởng tộc và Quản trị viên dòng họ sẽ kiểm tra đối soát biên lai chuyển khoản và ghi nhận vào sổ công đức của dòng họ.</p>
          </div>
          <button type="button" onClick={() => setDonateSuccess(false)}>Đóng</button>
        </div>
      )}

      <div className="member-donate-grid">
        {/* Cột 1: Thông tin chuyển khoản & Mã QR */}
        <div className="member-donate-card qr-card">
          <div className="card-header">
            <h3>Quét Mã QR Chuyển Khoản</h3>
            <p>Sử dụng ứng dụng ngân hàng bất kỳ để quét mã chuyển khoản nhanh</p>
          </div>

          <div className="qr-container">
            {/* Ảnh mã QR chuẩn VietQR */}
            <img
              src="https://api.vietqr.io/image/970436-1028889999-compact2.jpg?accountName=QUY%20DONG%20HO%20MAI%20THE%20TOC&addInfo=DONG%20GOP%20QUY%20DONG%20HO"
              alt="Mã QR chuyển khoản quỹ dòng họ"
              className="qr-image"
            />
          </div>

          <div className="bank-info-table">
            <div className="bank-row">
              <span className="bank-label">Ngân hàng:</span>
              <span className="bank-value">Vietcombank (VCB)</span>
            </div>
            <div className="bank-row">
              <span className="bank-label">Số tài khoản:</span>
              <span className="bank-value highlight">1028 889 999</span>
            </div>
            <div className="bank-row">
              <span className="bank-label">Chủ tài khoản:</span>
              <span className="bank-value">QUY DONG HO {clanName.toUpperCase()}</span>
            </div>
            <div className="bank-row">
              <span className="bank-label">Nội dung chuyển khoản:</span>
              <span className="bank-value note">[Họ và tên] - Dong gop quy</span>
            </div>
          </div>
        </div>

        {/* Cột 2: Form gửi thông báo sau khi chuyển khoản */}
        <div className="member-donate-card form-card">
          <div className="card-header">
            <h3>Gửi Thông Báo Xác Nhận Đóng Góp</h3>
            <p>Sau khi chuyển khoản, vui lòng điền thông tin bên dưới để Ban quản trị đối soát ghi danh</p>
          </div>

          <form className="donate-confirm-form" onSubmit={handleMemberDonateSubmit}>
            <div className="form-group">
              <label>Chọn mục đích quỹ đóng góp *</label>
              <select value={donateFundType} onChange={(e) => setDonateFundType(e.target.value)}>
                <option value="Quỹ Khuyến học & Phát triển tài năng">Quỹ Khuyến học & Phát triển tài năng</option>
                <option value="Quỹ Tu bổ Từ đường & Nghĩa trang">Quỹ Tu bổ Từ đường & Nghĩa trang</option>
                <option value="Quỹ Lễ tế & Giỗ tổ hàng năm">Quỹ Lễ tế & Giỗ tổ hàng năm</option>
                <option value="Quỹ Thăm hỏi hiếu hỷ & Nghĩa tình">Quỹ Thăm hỏi hiếu hỷ & Nghĩa tình</option>
              </select>
            </div>

            <div className="form-group">
              <label>Họ và tên người đóng góp *</label>
              <input
                type="text"
                required
                value={donateSender}
                onChange={(e) => setDonateSender(e.target.value)}
                placeholder="Nhập đầy đủ họ và tên..."
              />
            </div>

            <div className="form-group">
              <label>Số tiền đã chuyển khoản (VNĐ) *</label>
              <input
                type="number"
                required
                min="10000"
                step="10000"
                value={donateAmount}
                onChange={(e) => setDonateAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ví dụ: 500000"
              />
            </div>

            <div className="form-group">
              <label>Lời chúc / Lời nhắn tới gia tộc</label>
              <textarea
                rows={3}
                value={donateNote}
                onChange={(e) => setDonateNote(e.target.value)}
                placeholder="Con cháu kính cẩn đóng góp chút lòng thành xây dựng tổ đường..."
              />
            </div>

            <button type="submit" className="donate-submit-btn">
              Xác Nhận Đã Chuyển Khoản
            </button>
          </form>
        </div>
      </div>

      {/* Bảng Danh Sách Ghi Nhận Công Đức (Tri ân công khai) */}
      <div className="member-donate-honors-card">
        <div className="card-header">
          <h3>Bảng Vàng Tri Ân Công Đức Dòng Tộc</h3>
          <p>Ghi nhận những tấm lòng hảo tâm đã đóng góp xây dựng và vun đắp dòng họ</p>
        </div>

        <div className="honors-table-wrap">
          <table className="honors-table">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Mục đích đóng góp</th>
                <th>Ngày ghi nhận</th>
                <th>Số tiền công đức</th>
              </tr>
            </thead>
            <tbody>
              {publicDonations.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.party}</strong></td>
                  <td>{item.description}</td>
                  <td>{item.date}</td>
                  <td className="honor-amount">{formatVnd(item.amount)}</td>
                </tr>
              ))}
              {!publicDonations.length && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    Chưa có danh sách công đức được xác nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
    </section>
  );
};

export default ClanFundsModule;
