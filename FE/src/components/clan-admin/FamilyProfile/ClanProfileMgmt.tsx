import './ClanProfileMgmt.css';
import React, { useState, useEffect } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';


export interface ClanProfileData {
  id: string;
  name: string;
  founder: string;
  origin: string;
  history: string;
  branches: Array<{ id: string; name: string; head: string; total_members: number }>;
}

export const ClanProfileMgmt: React.FC = () => {
  const [profile, setProfile] = useState<ClanProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ClanProfileData>>({});
  const [msg, setMsg] = useState('');

  const fetchProfile = async () => {
    setLoading(true);
    setProfile({
      id: '',
      name: 'Chưa cập nhật',
      founder: '?',
      origin: 'Chưa cập nhật',
      history: 'Chưa có thông tin lịch sử.',
      branches: []
    });
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleEditClick = () => {
    if (profile) {
      setEditForm(profile);
      setIsEditModalOpen(true);
    }
  };

  const handleSave = () => {
    if (profile && editForm) {
      setProfile({ ...profile, ...editForm } as ClanProfileData);
      setMsg('Đã cập nhật thông tin dòng họ thành công.');
      setIsEditModalOpen(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  if (loading) return <div className="clan-profile-loading">Đang tải thông tin dòng họ...</div>;
  if (!profile) return <div className="clan-profile-error">Lỗi khi tải thông tin.</div>;

  return (
    <div className="admin-account-container">
      <PageHeader
        title="Hồ Sơ Dòng Họ"
        subtitle="Quản lý thông tin chung, lịch sử, thủy tổ và các chi phái trong dòng họ của bạn."
        actions={<button className="admin-btn-primary" onClick={handleEditClick}>Chỉnh sửa thông tin</button>}
      />

      {msg && <div className="clan-profile-alert">{msg}</div>}

      <div className="family-cards-grid">
        {/* Info Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Thông Tin Chung</h3>
            <span className="clan-profile-badge badge-role-pill acc-role-member">Chính thức</span>
          </div>
          <div className="admin-card-body">
            <div className="clan-profile-info-group">
              <div>
                <div className="clan-profile-info-label">Tên dòng họ</div>
                <div className="clan-profile-info-value">{profile.name}</div>
              </div>
              <div>
                <div className="clan-profile-info-label">Quê quán / Nhà thờ tổ</div>
                <div className="clan-profile-info-subvalue">{profile.origin}</div>
              </div>
              <div>
                <div className="clan-profile-info-label">Lịch sử hình thành</div>
                <div className="clan-profile-history-box">{profile.history}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Founder & Branches Card */}
        <div className="clan-profile-side-group">
          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Thủy Tổ (Đời 1)</h3>
            </div>
            <div className="admin-card-body">
              <div className="clan-profile-founder-row">
                <div className="clan-profile-founder-avatar">
                  {profile.founder.charAt(0)}
                </div>
                <div>
                  <div className="clan-profile-founder-name">{profile.founder}</div>
                  <div className="clan-profile-founder-desc">Cụ Tổ khai sáng dòng họ</div>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-header">
              <h3>Các Chi / Nhánh ({profile.branches.length})</h3>
              <button className="btn-icon-action clan-profile-add-btn">+ Thêm Chi</button>
            </div>
            <div className="admin-card-body clan-profile-card-body-no-pad">
              <ul className="clan-profile-branch-list">
                {profile.branches.map((b, idx) => (
                  <li key={b.id} className={`clan-profile-branch-item ${idx !== profile.branches.length - 1 ? "border-bottom" : ""}`}>
                    <div>
                      <div className="clan-profile-branch-name">{b.name}</div>
                      <div className="clan-profile-branch-head">Trưởng chi: {b.head}</div>
                    </div>
                    <div className="clan-profile-member-count badge-role-pill status-badge-locked">{b.total_members} thành viên</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="clan-modal-overlay">
          <div className="clan-modal-box">
            <div className="clan-modal-header">
              <h3>Chỉnh Sửa Hồ Sơ Dòng Họ</h3>
              <button className="clan-modal-close" onClick={() => setIsEditModalOpen(false)}>✕</button>
            </div>
            <div className="clan-profile-modal-body">
              <div className="form-group-admin">
                <label className="form-label-admin">Tên dòng họ</label>
                <input
                  type="text"
                  className="form-input-admin"
                  value={editForm.name || ''}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="form-group-admin">
                <label className="form-label-admin">Quê quán</label>
                <input
                  type="text"
                  className="form-input-admin"
                  value={editForm.origin || ''}
                  onChange={e => setEditForm({ ...editForm, origin: e.target.value })}
                />
              </div>
              <div className="form-group-admin">
                <label className="form-label-admin">Thủy tổ</label>
                <input
                  type="text"
                  className="form-input-admin"
                  value={editForm.founder || ''}
                  onChange={e => setEditForm({ ...editForm, founder: e.target.value })}
                />
              </div>
              <div className="form-group-admin">
                <label className="form-label-admin">Lịch sử</label>
                <textarea
                  rows={4}
                  value={editForm.history || ''}
                  onChange={e => setEditForm({ ...editForm, history: e.target.value })}
                  className="form-input-admin clan-profile-textarea"
                />
              </div>
            </div>
            <div className="clan-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setIsEditModalOpen(false)}>Hủy</button>
              <button className="admin-btn-primary" onClick={handleSave}>Lưu thông tin</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClanProfileMgmt;
