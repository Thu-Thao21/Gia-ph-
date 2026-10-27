import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import apiClient from '../../api/axios';
import { fetchClanProfile, updateClanProfile, fetchMembers } from '../../services/member.service';
import './ClanProfilePage.css';

export interface ClanProfilePageProps {
  clanId?: string;
}

export const ClanProfilePage: React.FC<ClanProfilePageProps> = ({ clanId }) => {
  const { account } = useAuth();
  const effectiveClanId = clanId || account?.clan_id || account?.memberships?.[0]?.clan_id;

  const roleLower = (account?.primary_role || '').toLowerCase();
  const activeRoles = (account?.roles || [])
    .filter((r) => r.status === 'active')
    .map((r) => r.role.toLowerCase());

  const isClanAdmin = [
    'trưởng tộc', 'chủ dòng họ', 'clan admin', 'clan_admin', 'family_head', 'business_owner'
  ].includes(roleLower) || activeRoles.some((r) => ['clan_admin', 'family_head', 'business_owner'].includes(r));

  const isFamilyAdmin = [
    'family admin', 'family_admin', 'manager'
  ].includes(roleLower) || activeRoles.some((r) => ['family_admin', 'manager'].includes(r));

  const canEdit = isClanAdmin || isFamilyAdmin;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [memberStats, setMemberStats] = useState({
    total: 0,
    generations: 1,
    males: 0,
    females: 0,
  });

  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editOriginPlace, setEditOriginPlace] = useState('');
  const [editAncestralAddress, setEditAncestralAddress] = useState('');
  const [editHistory, setEditHistory] = useState('');
  const [editPublicDesc, setEditPublicDesc] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadData = async () => {
    if (!effectiveClanId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profData, branchRes, memRes] = await Promise.all([
        fetchClanProfile(effectiveClanId),
        apiClient.get(`/families/${effectiveClanId}/branches`).catch(() => ({ data: [] })),
        fetchMembers({ familyId: effectiveClanId, limit: 1000 }),
      ]);

      if (profData) {
        setProfile(profData);
        setEditOriginPlace(profData.originPlace || '');
        setEditAncestralAddress(profData.ancestralHouseAddress || '');
        setEditHistory(profData.history || '');
        setEditPublicDesc(profData.publicDescription || '');
      }

      const branchItems = Array.isArray(branchRes.data?.items)
        ? branchRes.data.items
        : Array.isArray(branchRes.data)
        ? branchRes.data
        : [];
      setBranches(branchItems);

      const memList = memRes.items || [];
      const males = memList.filter((m) => m.gender === 'male').length;
      const females = memList.filter((m) => m.gender === 'female').length;
      const maxGen = memList.length > 0 ? Math.max(...memList.map((m) => m.generation || 1)) : 1;

      setMemberStats({
        total: memList.length,
        generations: maxGen,
        males,
        females,
      });
    } catch (err) {
      console.error('Lỗi khi tải hồ sơ gia tộc:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [effectiveClanId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveClanId) return;
    setSaveLoading(true);
    try {
      await updateClanProfile(effectiveClanId, {
        name: profile?.name,
        originPlace: editOriginPlace.trim() || null,
        ancestralHouseAddress: editAncestralAddress.trim() || null,
        history: editHistory.trim() || null,
        publicDescription: editPublicDesc.trim() || null,
      });
      setSuccessToast('Đã cập nhật hồ sơ dòng họ thành công!');
      setIsEditing(false);
      loadData();
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi cập nhật hồ sơ.');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
        Đang tải thông tin hồ sơ gia tộc từ cơ sở dữ liệu...
      </div>
    );
  }

  const clanName = profile?.name || account?.clan_name || 'Dòng tộc Họ Võ';

  return (
    <div className="clan-profile-container">
      {/* Hero Banner */}
      <div className="clan-profile-hero">
        <div className="clan-hero-header">
          <div className="clan-hero-title-group">
            <h1>Hồ Sơ Gia Tộc: {clanName}</h1>
            <div className="clan-hero-badges">
              <span className="clan-tag code">Mã tộc: {profile?.clanCode || 'CLAN-VO'}</span>
              <span className="clan-tag active">Trạng thái: Đang hoạt động</span>
            </div>
          </div>

          {canEdit && (
            <button className="clan-edit-btn" onClick={() => setIsEditing(true)}>
              Chỉnh sửa hồ sơ dòng họ
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="clan-stats-grid">
          <div className="clan-stat-card">
            <span className="clan-stat-label">Tổng thành viên</span>
            <span className="clan-stat-value">{memberStats.total}</span>
          </div>
          <div className="clan-stat-card">
            <span className="clan-stat-label">Số đời / Thế hệ</span>
            <span className="clan-stat-value">{memberStats.generations} đời</span>
          </div>
          <div className="clan-stat-card">
            <span className="clan-stat-label">Chi nhánh dòng tộc</span>
            <span className="clan-stat-value">{branches.length > 0 ? branches.length : 1} chi</span>
          </div>
          <div className="clan-stat-card">
            <span className="clan-stat-label">Tỷ lệ Nam / Nữ</span>
            <span className="clan-stat-value">{memberStats.males} Nam • {memberStats.females} Nữ</span>
          </div>
        </div>
      </div>

      {/* Grid: 2 Columns */}
      <div className="clan-grid-two-cols">
        {/* Left Column: General Info & Branches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="clan-card">
            <h2 className="clan-card-title">Thông Tin Hành Chính & Từ Đường</h2>
            
            <div className="clan-info-row">
              <span className="clan-info-label">Tên chính thức dòng họ</span>
              <span className="clan-info-value">{clanName}</span>
            </div>

            <div className="clan-info-row">
              <span className="clan-info-label">Trưởng tộc đương nhiệm</span>
              <span className="clan-info-value">Võ Trí Thắng</span>
            </div>

            <div className="clan-info-row">
              <span className="clan-info-label">Quê quán phát tích</span>
              <span className="clan-info-value">{profile?.originPlace || 'Đà Nẵng, Việt Nam'}</span>
            </div>

            <div className="clan-info-row">
              <span className="clan-info-label">Địa chỉ nhà thờ tộc / Từ đường</span>
              <span className="clan-info-value">{profile?.ancestralHouseAddress || 'Từ đường Họ Võ, Hòa Vang, Đà Nẵng'}</span>
            </div>
          </div>

          <div className="clan-card">
            <h2 className="clan-card-title">Các Chi Nhánh Trực Thuộc ({branches.length})</h2>
            {branches.length > 0 ? (
              <div className="clan-branch-list">
                {branches.map((b) => (
                  <div key={b.branchId || b.id} className="clan-branch-item">
                    <span className="clan-branch-name">{b.name || b.branchName}</span>
                    <span className="clan-branch-count">{b.memberCount || 0} thành viên</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Đang quản lý thống nhất tại Nhánh Trưởng.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: History & Clan Rules */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="clan-card">
            <h2 className="clan-card-title">Lịch Sử & Nguồn Gốc Dòng Họ</h2>
            <div className="clan-prose">
              {profile?.history || 
                'Dòng tộc Họ Võ có truyền thống lâu đời, phát tích và định cư tại miền Trung Việt Nam. Các thế hệ con cháu luôn nêu cao tinh thần hiếu học, đoàn kết, phụng sự tổ quốc và giữ gìn gia phong đạo đức.'}
            </div>
          </div>

          <div className="clan-card">
            <h2 className="clan-card-title">Tộc Ước & Gia Huấn Dòng Tộc</h2>
            <div className="clan-prose">
              {profile?.publicDescription || 
                '1. Kính trên nhường dưới, hiếu thuận với ông bà cha mẹ.\n2. Giữ gìn gia phong, tương thân tương ái, giúp đỡ bà con trong dòng họ.\n3. Khuyến học khuyến tài, vun đắp tương lai cho thế hệ mai sau.\n4. Định kỳ tề tựu vào các dịp giỗ tổ và tế xuân hàng năm.'}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Clan Modal */}
      {isEditing && (
        <div className="tree-action-modal-backdrop" onClick={() => setIsEditing(false)}>
          <div className="tree-action-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <form onSubmit={handleSaveProfile}>
              <div className="tree-action-modal-header">
                <h3 className="tree-action-modal-title">Cập nhật hồ sơ dòng họ</h3>
                <button type="button" className="tree-action-modal-close-btn" onClick={() => setIsEditing(false)}>✕</button>
              </div>

              <div className="tree-action-modal-body">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Quê quán phát tích</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={editOriginPlace}
                    onChange={(e) => setEditOriginPlace(e.target.value)}
                    placeholder="Ví dụ: Hòa Vang, Đà Nẵng"
                  />
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Địa chỉ từ đường / Nhà thờ tộc</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={editAncestralAddress}
                    onChange={(e) => setEditAncestralAddress(e.target.value)}
                    placeholder="Ví dụ: Thôn Túy Loan, Hòa Phong, Hòa Vang"
                  />
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Lịch sử & Nguồn gốc dòng họ</label>
                  <textarea
                    className="tree-action-form-input"
                    rows={4}
                    value={editHistory}
                    onChange={(e) => setEditHistory(e.target.value)}
                    placeholder="Ghi chép lịch sử phát tích, công tích của tiền nhân..."
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Tộc ước & Gia huấn dòng họ</label>
                  <textarea
                    className="tree-action-form-input"
                    rows={4}
                    value={editPublicDesc}
                    onChange={(e) => setEditPublicDesc(e.target.value)}
                    placeholder="Các điều khoản quy ước, đạo đức, gia phong..."
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="tree-action-modal-footer">
                <button type="button" className="tree-action-btn secondary" onClick={() => setIsEditing(false)}>
                  Hủy
                </button>
                <button type="submit" className="tree-action-btn primary" disabled={saveLoading}>
                  {saveLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(22, 163, 74, 0.4)',
            fontSize: '14px',
            fontWeight: 600,
            zIndex: 10000,
          }}
        >
          {successToast}
        </div>
      )}
    </div>
  );
};

export default ClanProfilePage;
