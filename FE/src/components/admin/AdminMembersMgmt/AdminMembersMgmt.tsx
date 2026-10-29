import React, { useEffect, useMemo, useState, useCallback } from 'react';
import apiClient from '../../../api/axios';
import { useAuth } from '../../../context/AuthContext';
import { useClanContext } from '../../../context/ClanContext';
import { fetchFamilyPersons, createFamilyPerson, updateFamilyPerson } from '../../../services/genealogy.service';
import { GenderAvatar } from '../../common/GenderAvatar';
import './AdminMembersMgmt.css';

type MemberGender = 'male' | 'female' | 'other';
type MemberStatus = 'active' | 'hidden';

export interface MemberItem {
  id: string;
  full_name: string;
  other_name?: string;
  gender: MemberGender | string;
  birth_date?: string;
  is_alive: boolean;
  branch?: string;
  generation: number;
  relationship?: string;
  status: MemberStatus | string;
  avatar_url?: string;
  phone?: string;
  email?: string;
  has_account?: boolean;
}

type MemberFormData = Omit<MemberItem, 'id'>;
type ModalMode = 'add' | 'member' | null;
type ModalTab = 'detail' | 'edit';

const EMPTY_FORM: MemberFormData = {
  full_name: '',
  other_name: '',
  gender: 'male',
  birth_date: '',
  is_alive: true,
  branch: 'Chi chính',
  generation: 1,
  relationship: 'Thành viên',
  status: 'active',
  phone: '',
  email: '',
  has_account: false,
};

const formatDate = (date?: string) =>
  date
    ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${date}T00:00:00`))
    : 'Chưa cập nhật';

const getAge = (date?: string) => {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age;
};

export const AdminMembersMgmt: React.FC = () => {
  const { activeClanId } = useClanContext();
  const { account } = useAuth();
  const initialClanId = activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id || '';

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalTab, setModalTab] = useState<ModalTab>('detail');
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);
  const [formData, setFormData] = useState<MemberFormData>(EMPTY_FORM);
  const [toast, setToast] = useState('');
  const [clanId, setClanId] = useState<string>(initialClanId);

  useEffect(() => {
    if (activeClanId && activeClanId !== clanId) {
      setClanId(activeClanId);
    }
  }, [activeClanId, clanId]);

  const loadMembers = useCallback(async (targetClanId: string) => {
    if (!targetClanId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let effectiveClanId = targetClanId;

      const persons = await fetchFamilyPersons(effectiveClanId);
      if (Array.isArray(persons)) {
        setMembers(
          persons.map((p) => ({
            id: p.id,
            full_name: p.fullName,
            gender: (p.gender || 'other').toLowerCase(),
            birth_date: p.birthDate || undefined,
            is_alive: p.isLiving,
            branch: 'Chi chính',
            generation: p.generation || 1,
            relationship: p.generation === 1 ? 'Thủy tổ / Cụ tổ' : `Đời thứ ${p.generation}`,
            status: p.isLiving ? 'active' : 'hidden',
            avatar_url: p.avatarUrl || undefined,
          }))
        );
      }
    } catch (err: any) {
      console.error('Lỗi khi tải thành viên từ BE:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers(clanId);
  }, [loadMembers, clanId]);

  useEffect(() => {
    if (!modalMode) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalMode(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [modalMode]);

  const filteredMembers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('vi');
    return members.filter((member) => {
      const haystack = [
        member.full_name,
        member.other_name,
        member.branch,
        member.relationship,
        member.phone,
        member.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi');
      return (
        (!query || haystack.includes(query)) &&
        (statusFilter === 'all' || member.status === statusFilter)
      );
    });
  }, [members, searchTerm, statusFilter]);

  const activeCount = members.filter((member) => member.status === 'active').length;
  const accountCount = members.filter((member) => member.has_account).length;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const openDetailModal = (member: MemberItem) => {
    setSelectedMember(member);
    setFormData({
      full_name: member.full_name,
      other_name: member.other_name ?? '',
      gender: (member.gender || 'other').toLowerCase(),
      birth_date: member.birth_date ?? '',
      is_alive: member.is_alive,
      branch: member.branch ?? 'Chi chính',
      generation: member.generation || 1,
      relationship: member.relationship ?? 'Thành viên',
      status: member.status,
      avatar_url: member.avatar_url,
      phone: member.phone ?? '',
      email: member.email ?? '',
      has_account: member.has_account ?? false,
    });
    setModalTab('detail');
    setModalMode('member');
  };

  const openEditModal = (member: MemberItem) => {
    setSelectedMember(member);
    setFormData({
      full_name: member.full_name,
      other_name: member.other_name ?? '',
      gender: (member.gender || 'other').toLowerCase(),
      birth_date: member.birth_date ?? '',
      is_alive: member.is_alive,
      branch: member.branch ?? 'Chi chính',
      generation: member.generation || 1,
      relationship: member.relationship ?? 'Thành viên',
      status: member.status,
      avatar_url: member.avatar_url,
      phone: member.phone ?? '',
      email: member.email ?? '',
      has_account: member.has_account ?? false,
    });
    setModalTab('edit');
    setModalMode('member');
  };

  const openAddModal = () => {
    setSelectedMember(null);
    setFormData({ ...EMPTY_FORM });
    setModalMode('add');
  };

  const saveMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedName = formData.full_name.trim();
    if (!cleanedName) return;

    const todayStr = new Date().toISOString().split('T')[0];
    if (formData.birth_date && formData.birth_date > todayStr) {
      showToast('Ngày sinh không thể lớn hơn ngày hiện tại.');
      return;
    }

    if (modalMode === 'member' && selectedMember) {
      if (selectedMember.relationship === 'Vợ / Chồng' && selectedMember.gender !== formData.gender) {
        const confirmed = window.confirm(
          'Người này đang có quan hệ hôn phối (vợ/chồng). Việc thay đổi giới tính có thể tác động đến hiển thị quan hệ trong gia phả. Bạn có chắc chắn muốn tiếp tục?'
        );
        if (!confirmed) return;
      }
    }

    try {
      if (modalMode === 'member' && selectedMember) {
        await updateFamilyPerson(clanId, selectedMember.id, {
          fullName: cleanedName,
          gender: formData.gender,
          birthDate: formData.birth_date || null,
          isLiving: formData.is_alive,
          generation: formData.generation || 1,
        });
        showToast(`Đã cập nhật thông tin của ${cleanedName} thành công.`);
        setMembers((current) =>
          current.map((item) =>
            item.id === selectedMember.id
              ? {
                  ...item,
                  full_name: cleanedName,
                  other_name: formData.other_name,
                  gender: formData.gender,
                  birth_date: formData.birth_date,
                  is_alive: formData.is_alive,
                  generation: formData.generation,
                  branch: formData.branch,
                  relationship: formData.relationship,
                  phone: formData.phone,
                  email: formData.email,
                  has_account: formData.has_account,
                }
              : item
          )
        );
        setSelectedMember((prev) =>
          prev
            ? {
                ...prev,
                full_name: cleanedName,
                other_name: formData.other_name,
                gender: formData.gender,
                birth_date: formData.birth_date,
                is_alive: formData.is_alive,
                generation: formData.generation,
                branch: formData.branch,
                relationship: formData.relationship,
                phone: formData.phone,
                email: formData.email,
                has_account: formData.has_account,
              }
            : null
        );
        setModalTab('detail');
      } else {
        await createFamilyPerson(clanId, {
          fullName: cleanedName,
          gender: formData.gender,
          birthDate: formData.birth_date || null,
          isLiving: formData.is_alive,
          generation: formData.generation || 1,
        });
        showToast(`Đã thêm ${cleanedName} vào gia phả thành công.`);
        setModalMode(null);
        loadMembers(clanId);
      }
    } catch (err: any) {
      showToast(`Lỗi: ${err?.response?.data?.detail || err.message}`);
    }
  };

  const toggleVisibility = async (member: MemberItem) => {
    const nextStatus: MemberStatus = member.status === 'hidden' ? 'active' : 'hidden';
    try {
      await updateFamilyPerson(clanId, member.id, {
        isLiving: nextStatus === 'active',
      });
      const updatedMembers = members.map((item) =>
        item.id === member.id ? { ...item, status: nextStatus, is_alive: nextStatus === 'active' } : item
      );
      setMembers(updatedMembers);
      if (selectedMember && selectedMember.id === member.id) {
        setSelectedMember({ ...selectedMember, status: nextStatus, is_alive: nextStatus === 'active' });
      }
      showToast(`${member.full_name} đã được ${nextStatus === 'hidden' ? 'ẩn khỏi danh sách' : 'khôi phục'}.`);
    } catch (err: any) {
      showToast(`Lỗi: ${err?.response?.data?.detail || err.message}`);
    }
  };

  return (
    <section className="family-members-page" aria-labelledby="family-members-title">
      <div className="family-members-breadcrumb" aria-label="Đường dẫn">
        <span>Quản lý gia phả</span>
        <span className="family-breadcrumb-sep">/</span>
        <strong>Nhân khẩu</strong>
      </div>

      <header className="family-members-hero">
        <div>
          <span className="family-members-eyebrow">QUẢN TRỊ DÒNG HỌ</span>
          <h1 id="family-members-title">Quản lý Nhân khẩu</h1>
          <p>Quản lý hồ sơ, quan hệ và tài khoản của các thành viên trong dòng họ.</p>
        </div>
        <button type="button" className="family-primary-button" onClick={openAddModal}>
          + Thêm thành viên
        </button>
      </header>

      <div className="family-members-stats" aria-label="Thống kê nhân khẩu">
        <div>
          <span>Tổng thành viên</span>
          <strong>{members.length}</strong>
        </div>
        <div>
          <span>Đang hiển thị</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Có tài khoản</span>
          <strong>{accountCount}</strong>
        </div>
      </div>

      <div className="family-members-panel">
        <div className="family-members-toolbar">
          <label className="family-search-field">
            <span className="sr-only">Tìm kiếm thành viên</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo họ tên, chi nhánh, quan hệ..."
            />
          </label>
          <div className="family-status-filter" role="group" aria-label="Lọc trạng thái">
            {([['all', 'Tất cả'], ['active', 'Đang hiển thị'], ['hidden', 'Đã ẩn']] as const).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'active' : ''}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>

        <div className="family-table-heading">
          <div>
            <h2>Danh sách thành viên</h2>
            <p>Bấm vào bất kỳ dòng nào để xem chi tiết và chỉnh sửa trực tiếp ({filteredMembers.length} thành viên)</p>
          </div>
          <span className="family-live-dot">
            <i /> Dữ liệu gia phả
          </span>
        </div>

        <div className="family-table-wrap">
          <table className="family-members-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Thành viên</th>
                <th style={{ width: '16%' }}>Ngày sinh</th>
                <th style={{ width: '16%' }}>Đời / Chi</th>
                <th style={{ width: '14%' }}>Quan hệ</th>
                <th style={{ width: '12%' }}>Trạng thái</th>
                <th style={{ width: '14%' }} className="family-actions-heading">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="family-table-message">
                    Đang tải danh sách thành viên...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="family-table-message">
                    Không tìm thấy thành viên phù hợp.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const age = getAge(member.birth_date);
                  return (
                    <tr
                      key={member.id}
                      className={`family-member-row ${member.status === 'hidden' ? 'is-hidden' : ''}`}
                      onClick={() => openDetailModal(member)}
                      title="Bấm để xem chi tiết và chỉnh sửa"
                    >
                      <td data-label="Thành viên">
                        <div className="family-member-cell">
                          <div className={`family-member-avatar gender-${member.gender}`}>
                            <GenderAvatar
                              avatarUrl={member.avatar_url}
                              gender={member.gender}
                              name={member.full_name}
                              size={36}
                            />
                          </div>
                          <div>
                            <strong>{member.full_name}</strong>
                            <span>{member.other_name || member.email || 'Chưa liên kết email'}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Ngày sinh">
                        <strong className="family-table-primary">{formatDate(member.birth_date)}</strong>
                        <span className="family-table-secondary">
                          {age === null ? 'Chưa rõ tuổi' : `${age} tuổi`}
                        </span>
                      </td>
                      <td data-label="Đời / Chi">
                        <strong className="family-table-primary">Đời thứ {member.generation}</strong>
                        <span className="family-branch-badge">{member.branch || 'Chưa phân chi'}</span>
                      </td>
                      <td data-label="Quan hệ">
                        <span className="family-relation-text">{member.relationship || 'Thành viên'}</span>
                      </td>
                      <td data-label="Trạng thái">
                        <span className={`family-status-badge ${member.status}`}>
                          <i />
                          {member.status === 'hidden' ? 'Đã ẩn' : 'Hiển thị'}
                        </span>
                        <span className={`family-account-state ${member.has_account ? 'linked' : ''}`}>
                          {member.has_account ? 'Có tài khoản' : 'Chưa có tài khoản'}
                        </span>
                      </td>
                      <td data-label="Thao tác" onClick={(e) => e.stopPropagation()}>
                        <div className="family-row-actions">
                          <button
                            type="button"
                            className="family-tbl-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetailModal(member);
                            }}
                            title="Xem chi tiết"
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            className="family-tbl-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(member);
                            }}
                            title="Chỉnh sửa thông tin"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`family-tbl-btn ${member.status === 'hidden' ? 'restore' : 'danger'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleVisibility(member);
                            }}
                            title={member.status === 'hidden' ? 'Khôi phục hiển thị' : 'Ẩn khỏi gia phả'}
                          >
                            {member.status === 'hidden' ? 'Hiện' : 'Ẩn'}
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
      </div>

      {toast && (
        <div className="family-members-toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}

      {/* Unified Member Modal (Detail & Edit) */}
      {modalMode === 'member' && selectedMember && (
        <div
          className="family-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalMode(null);
          }}
        >
          <div
            className="family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-modal-title"
          >
            {/* Header */}
            <div className="family-modal-header">
              <div>
                <span className="family-modal-eyebrow">HỒ SƠ NHÂN KHẨU</span>
                <h2 id="member-modal-title">
                  {modalTab === 'detail' ? 'Chi tiết thành viên' : 'Chỉnh sửa thành viên'}
                </h2>
              </div>
              <button
                type="button"
                className="family-modal-close"
                onClick={() => setModalMode(null)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Segmented Control Tabs */}
            <div className="family-modal-tabs">
              <button
                type="button"
                className={`family-modal-tab ${modalTab === 'detail' ? 'active' : ''}`}
                onClick={() => setModalTab('detail')}
              >
                Hồ sơ chi tiết
              </button>
              <button
                type="button"
                className={`family-modal-tab ${modalTab === 'edit' ? 'active' : ''}`}
                onClick={() => setModalTab('edit')}
              >
                Chỉnh sửa thông tin
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="family-modal-scroll">
              {modalTab === 'detail' ? (
                <div className="family-detail-wrapper">
                  {/* Hero Profile Card */}
                  <div className="family-detail-hero">
                    <div className={`family-detail-avatar gender-${selectedMember.gender}`}>
                      <GenderAvatar
                        avatarUrl={selectedMember.avatar_url}
                        gender={selectedMember.gender}
                        name={selectedMember.full_name}
                        size={56}
                      />
                    </div>
                    <div className="family-detail-hero-info">
                      <h3 className="family-detail-name">{selectedMember.full_name}</h3>
                      <p className="family-detail-sub">
                        {selectedMember.other_name
                          ? `Tên tự/biệt danh: ${selectedMember.other_name}`
                          : `Đời thứ ${selectedMember.generation} • ${selectedMember.branch || 'Chi chính'}`}
                      </p>
                      <div className="family-badge-row">
                        <span className={`family-pill family-pill-${selectedMember.status}`}>
                          <i className="family-pill-dot" />
                          {selectedMember.status === 'hidden' ? 'Đã ẩn' : 'Đang hiển thị'}
                        </span>
                        <span className={`family-pill ${selectedMember.is_alive ? 'family-pill-alive' : 'family-pill-deceased'}`}>
                          {selectedMember.is_alive ? 'Còn sống' : 'Đã tạ thế'}
                        </span>
                        <span className={`family-pill ${selectedMember.has_account ? 'family-pill-account' : 'family-pill-noacc'}`}>
                          {selectedMember.has_account ? 'Đã có tài khoản' : 'Chưa tạo tài khoản'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Info Grid */}
                  <div className="family-detail-grid">
                    <div className="family-detail-item">
                      <span className="family-detail-label">Ngày sinh & Độ tuổi</span>
                      <strong className="family-detail-val">
                        {formatDate(selectedMember.birth_date)}
                        {getAge(selectedMember.birth_date) !== null && (
                          <span className="family-age-tag"> ({getAge(selectedMember.birth_date)} tuổi)</span>
                        )}
                      </strong>
                    </div>

                    <div className="family-detail-item">
                      <span className="family-detail-label">Giới tính</span>
                      <strong className="family-detail-val">
                        {selectedMember.gender === 'male'
                          ? 'Nam'
                          : selectedMember.gender === 'female'
                          ? 'Nữ'
                          : 'Khác'}
                      </strong>
                    </div>

                    <div className="family-detail-item">
                      <span className="family-detail-label">Thế hệ</span>
                      <strong className="family-detail-val">Đời thứ {selectedMember.generation}</strong>
                    </div>

                    <div className="family-detail-item">
                      <span className="family-detail-label">Chi họ / Nhánh</span>
                      <strong className="family-detail-val">
                        {selectedMember.branch || 'Chưa phân chi'}
                      </strong>
                    </div>

                    <div className="family-detail-item">
                      <span className="family-detail-label">Quan hệ trong họ</span>
                      <strong className="family-detail-val">
                        {selectedMember.relationship || 'Thành viên'}
                      </strong>
                    </div>

                    <div className="family-detail-item">
                      <span className="family-detail-label">Số điện thoại</span>
                      <strong className="family-detail-val">
                        {selectedMember.phone || 'Chưa cập nhật'}
                      </strong>
                    </div>

                    <div className="family-detail-item wide">
                      <span className="family-detail-label">Email tài khoản</span>
                      <strong className="family-detail-val">
                        {selectedMember.email || 'Chưa liên kết email'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                /* Edit Form */
                <form id="family-member-edit-form" onSubmit={saveMember} className="family-edit-form">
                  <div className="family-form-grid">
                    <label className="family-field wide">
                      <span>Họ và tên <b>*</b></span>
                      <input
                        autoFocus
                        required
                        data-testid="input-member-fullname"
                        value={formData.full_name}
                        onChange={(event) =>
                          setFormData({ ...formData, full_name: event.target.value })
                        }
                        placeholder="Ví dụ: Vũ Văn An"
                      />
                    </label>

                    <label className="family-field">
                      <span>Tên gọi khác / Biệt danh</span>
                      <input
                        value={formData.other_name || ''}
                        onChange={(event) =>
                          setFormData({ ...formData, other_name: event.target.value })
                        }
                        placeholder="Tên thường gọi..."
                      />
                    </label>

                    <label className="family-field">
                      <span>Ngày sinh</span>
                      <input
                        type="date"
                        data-testid="input-member-birthdate"
                        max={new Date().toISOString().split('T')[0]}
                        value={formData.birth_date}
                        onChange={(event) =>
                          setFormData({ ...formData, birth_date: event.target.value })
                        }
                      />
                    </label>

                    <label className="family-field">
                      <span>Giới tính</span>
                      <select
                        data-testid="select-member-gender"
                        value={formData.gender}
                        onChange={(event) =>
                          setFormData({ ...formData, gender: event.target.value })
                        }
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </label>

                    <label className="family-field">
                      <span>Quan hệ trong gia tộc <b>*</b></span>
                      <select
                        required
                        value={formData.relationship}
                        onChange={(event) =>
                          setFormData({ ...formData, relationship: event.target.value })
                        }
                      >
                        <option value="">Chọn quan hệ</option>
                        <option value="Thủy tổ / Cụ tổ">Thủy tổ / Cụ tổ</option>
                        <option value="Vợ / Chồng">Vợ / Chồng</option>
                        <option value="Con trai">Con trai</option>
                        <option value="Con gái">Con gái</option>
                        <option value="Con dâu">Con dâu</option>
                        <option value="Con rể">Con rể</option>
                        <option value="Anh / Chị / Em">Anh / Chị / Em</option>
                        <option value="Cháu">Cháu</option>
                        <option value="Thành viên">Thành viên</option>
                        <option value="Thành viên khác">Thành viên khác</option>
                      </select>
                    </label>

                    <label className="family-field">
                      <span>Chi nhánh</span>
                      <select
                        value={formData.branch}
                        onChange={(event) =>
                          setFormData({ ...formData, branch: event.target.value })
                        }
                      >
                        <option value="Chi chính">Chi chính</option>
                        <option value="Chi Trưởng">Chi Trưởng</option>
                        <option value="Chi Hai">Chi Hai</option>
                        <option value="Chi Ba">Chi Ba</option>
                        <option value="Chưa phân chi">Chưa phân chi</option>
                      </select>
                    </label>

                    <label className="family-field">
                      <span>Đời thứ</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={formData.generation}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            generation: Number(event.target.value) || 1,
                          })
                        }
                      />
                    </label>

                    <label className="family-field">
                      <span>Tình trạng</span>
                      <select
                        value={formData.is_alive ? 'alive' : 'deceased'}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            is_alive: event.target.value === 'alive',
                          })
                        }
                      >
                        <option value="alive">Còn sống</option>
                        <option value="deceased">Đã tạ thế</option>
                      </select>
                    </label>

                    <label className="family-field">
                      <span>Số điện thoại</span>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(event) =>
                          setFormData({ ...formData, phone: event.target.value })
                        }
                        placeholder="090 000 0000"
                      />
                    </label>

                    <label className="family-field wide">
                      <span>Email liên kết tài khoản</span>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(event) =>
                          setFormData({
                            ...formData,
                            email: event.target.value,
                            has_account: Boolean(event.target.value),
                          })
                        }
                        placeholder="thanhvien@example.com"
                      />
                      <small>Để trống nếu thành viên chưa cần tài khoản đăng nhập.</small>
                    </label>
                  </div>
                </form>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="family-modal-footer">
              {modalTab === 'detail' ? (
                <>
                  <button
                    type="button"
                    className="family-btn-danger"
                    onClick={() => toggleVisibility(selectedMember)}
                  >
                    {selectedMember.status === 'hidden' ? 'Khôi phục hiển thị' : 'Ẩn khỏi gia phả'}
                  </button>
                  <div className="family-footer-actions">
                    <button
                      type="button"
                      className="family-btn-ghost"
                      onClick={() => setModalMode(null)}
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      className="family-btn-primary"
                      onClick={() => setModalTab('edit')}
                    >
                      Chỉnh sửa hồ sơ
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="family-btn-ghost"
                    onClick={() => setModalTab('detail')}
                  >
                    Quay lại chi tiết
                  </button>
                  <div className="family-footer-actions">
                    <button
                      type="button"
                      className="family-btn-ghost"
                      onClick={() => setModalMode(null)}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      form="family-member-edit-form"
                      className="family-btn-primary"
                      data-testid="btn-save-member"
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

      {/* Modal Add New Member */}
      {modalMode === 'add' && (
        <div
          className="family-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalMode(null);
          }}
        >
          <div
            className="family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-add-title"
          >
            <div className="family-modal-header">
              <div>
                <span className="family-modal-eyebrow">THÀNH VIÊN MỚI</span>
                <h2 id="member-add-title">Thêm thành viên gia phả</h2>
              </div>
              <button
                type="button"
                className="family-modal-close"
                onClick={() => setModalMode(null)}
                aria-label="Đóng"
                title="Đóng (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="family-modal-scroll">
              <form id="family-member-add-form" onSubmit={saveMember} className="family-edit-form">
                <div className="family-form-grid">
                  <label className="family-field wide">
                    <span>Họ và tên <b>*</b></span>
                    <input
                      autoFocus
                      required
                      data-testid="input-member-fullname"
                      value={formData.full_name}
                      onChange={(event) =>
                        setFormData({ ...formData, full_name: event.target.value })
                      }
                      placeholder="Ví dụ: Vũ Văn An"
                    />
                  </label>

                  <label className="family-field">
                    <span>Ngày sinh</span>
                    <input
                      type="date"
                      data-testid="input-member-birthdate"
                      max={new Date().toISOString().split('T')[0]}
                      value={formData.birth_date}
                      onChange={(event) =>
                        setFormData({ ...formData, birth_date: event.target.value })
                      }
                    />
                  </label>

                  <label className="family-field">
                    <span>Giới tính</span>
                    <select
                      data-testid="select-member-gender"
                      value={formData.gender}
                      onChange={(event) =>
                        setFormData({ ...formData, gender: event.target.value })
                      }
                    >
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </label>

                  <label className="family-field">
                    <span>Quan hệ trong gia tộc <b>*</b></span>
                    <select
                      required
                      value={formData.relationship}
                      onChange={(event) =>
                        setFormData({ ...formData, relationship: event.target.value })
                      }
                    >
                      <option value="">Chọn quan hệ</option>
                      <option value="Vợ / Chồng">Vợ / Chồng</option>
                      <option value="Con trai">Con trai</option>
                      <option value="Con gái">Con gái</option>
                      <option value="Con dâu">Con dâu</option>
                      <option value="Con rể">Con rể</option>
                      <option value="Anh / Chị / Em">Anh / Chị / Em</option>
                      <option value="Cháu">Cháu</option>
                      <option value="Thành viên">Thành viên</option>
                      <option value="Thành viên khác">Thành viên khác</option>
                    </select>
                  </label>

                  <label className="family-field">
                    <span>Chi nhánh</span>
                    <select
                      value={formData.branch}
                      onChange={(event) =>
                        setFormData({ ...formData, branch: event.target.value })
                      }
                    >
                      <option value="Chi chính">Chi chính</option>
                      <option value="Chi Trưởng">Chi Trưởng</option>
                      <option value="Chi Hai">Chi Hai</option>
                      <option value="Chi Ba">Chi Ba</option>
                      <option value="Chưa phân chi">Chưa phân chi</option>
                    </select>
                  </label>

                  <label className="family-field">
                    <span>Đời thứ</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={formData.generation}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          generation: Number(event.target.value) || 1,
                        })
                      }
                    />
                  </label>

                  <label className="family-field">
                    <span>Số điện thoại</span>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(event) =>
                        setFormData({ ...formData, phone: event.target.value })
                      }
                      placeholder="090 000 0000"
                    />
                  </label>

                  <label className="family-field wide">
                    <span>Email tài khoản</span>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          email: event.target.value,
                          has_account: Boolean(event.target.value),
                        })
                      }
                      placeholder="thanhvien@example.com"
                    />
                    <small>Để trống nếu thành viên chưa cần tài khoản đăng nhập.</small>
                  </label>
                </div>
              </form>
            </div>

            <div className="family-modal-footer">
              <div style={{ marginLeft: 'auto' }} className="family-footer-actions">
                <button
                  type="button"
                  className="family-btn-ghost"
                  onClick={() => setModalMode(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="family-member-add-form"
                  className="family-btn-primary"
                  data-testid="btn-save-member"
                >
                  Thêm thành viên
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminMembersMgmt;
