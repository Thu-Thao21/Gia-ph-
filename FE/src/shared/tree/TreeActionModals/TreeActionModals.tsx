import React, { useState, useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { Member } from '../../../types/member';
import apiClient from '../../../api/axios';
import './TreeActionModals.css';

export type ModalType = 'edit' | 'delete' | 'addChild' | 'addSpouse' | 'relocate' | 'initRoot' | 'addRoot' | null;

interface TreeActionModalsProps {
  type: ModalType;
  node: ErgoTreeNode | null;
  familyId?: string;
  familyName?: string;
  allMembers?: Member[];
  canManageTree?: boolean;
  isSelf?: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const TreeActionModals: React.FC<TreeActionModalsProps> = ({
  type,
  node,
  familyId,
  familyName,
  allMembers = [],
  canManageTree = false,
  isSelf = false,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [isAlive, setIsAlive] = useState(true);
  const [bio, setBio] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');

  useEffect(() => {
    if (!node && type !== 'initRoot' && type !== 'addRoot') return;
    setError(null);

    if (type === 'initRoot' || type === 'addRoot') {
      setFullName('');
      setGender('male');
      setBirthDate('');
      setDeathDate('');
      setIsAlive(false);
      setBio('');
    } else if (type === 'edit' && node) {
      setFullName(node.fullName || '');
      setGender((node.gender === 'female' ? 'female' : 'male'));
      setBirthDate(node.birthDate || '');
      setDeathDate((node as any).deathDate || '');
      setIsAlive(node.isAlive !== false);
      setBio((node as any).bio || '');
    } else if (type === 'addChild') {
      setFullName('');
      setGender('male');
      setBirthDate('');
      setDeathDate('');
      setIsAlive(true);
      setBio('');
    } else if (type === 'addSpouse' && node) {
      setFullName('');
      // Suggest opposite gender
      setGender(node.gender === 'female' ? 'male' : 'female');
      setBirthDate('');
      setDeathDate('');
      setIsAlive(true);
      setBio('');
    } else if (type === 'relocate' && node) {
      const otherParents = allMembers.filter((m) => m.id !== node.id);
      if (otherParents.length > 0) {
        setSelectedParentId(otherParents[0].id);
      }
    }
  }, [type, node, allMembers]);

  if (!type || !node) return null;

  // 0. Submit Init Root (Cụ Thủy Tổ - Đời 1)
  const handleInitRootSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTree) {
      setError('Chức năng khởi tạo cây gia phả chỉ dành cho Ban quản trị dòng họ.');
      return;
    }
    if (!fullName.trim()) {
      setError('Họ và tên Cụ Thủy Tổ không được để trống');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/members', {
        family_id: familyId,
        fullName: fullName.trim(),
        gender,
        birthDate: birthDate.trim() || null,
        deathDate: isAlive ? null : deathDate.trim() || null,
        isAlive,
        bio: bio.trim() || null,
        generation: 1,
      });
      onSuccess(`Đã khởi tạo thành công Cụ Thủy Tổ '${fullName.trim()}' (Đời 1)!`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi khởi tạo cây gia phả.');
    } finally {
      setLoading(false);
    }
  };

  // 1. Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTree && !isSelf) {
      setError('Bạn chỉ có quyền chỉnh sửa thông tin của chính mình.');
      return;
    }
    if (!fullName.trim()) {
      setError('Họ và tên không được để trống');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.patch(`/members/${node.id}`, {
        fullName: fullName.trim(),
        gender,
        birthDate: birthDate.trim() || null,
        deathDate: isAlive ? null : deathDate.trim() || null,
        isAlive,
        bio: bio.trim() || null,
      });
      onSuccess(`Đã cập nhật thông tin thành viên '${fullName.trim()}' thành công!`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi cập nhật.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Delete
  const handleDeleteSubmit = async () => {
    if (!canManageTree) {
      setError('Chức năng xóa chỉ dành cho Ban quản trị dòng họ.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/members/${node.id}`);
      onSuccess(`Đã xóa thành viên '${node.fullName}' khỏi cây gia phả!`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi xóa thành viên.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Submit Add Child
  const handleAddChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTree) {
      setError('Chức năng thêm con chỉ dành cho Ban quản trị dòng họ.');
      return;
    }
    if (!fullName.trim()) {
      setError('Họ và tên con không được để trống');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/members', {
        family_id: familyId,
        parentId: node.id,
        fullName: fullName.trim(),
        gender,
        birthDate: birthDate.trim() || null,
        isAlive: true,
      });
      onSuccess(`Đã thêm con '${fullName.trim()}' cho '${node.fullName}' thành công!`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi thêm con.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Submit Add Spouse
  const handleAddSpouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTree) {
      setError('Chức năng thêm vợ/chồng chỉ dành cho Ban quản trị dòng họ.');
      return;
    }
    if (!fullName.trim()) {
      setError('Họ và tên Vợ/Chồng không được để trống');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post('/members', {
        family_id: familyId,
        spouseId: node.id,
        fullName: fullName.trim(),
        gender,
        birthDate: birthDate.trim() || null,
        isAlive: true,
      });
      onSuccess(`Đã thêm Vợ/Chồng '${fullName.trim()}' cho '${node.fullName}' thành công!`);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi thêm Vợ/Chồng.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Submit Relocate
  const handleRelocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTree && !isSelf) {
      setError('Chức năng nối phả hệ / di chuyển nhánh chỉ dành cho Ban quản trị dòng họ hoặc chính thành viên.');
      return;
    }
    if (!selectedParentId) {
      setError('Vui lòng chọn cha/mẹ trong dòng họ để kết nối');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiClient.post(`/members/${node.id}/relocate`, {
        newParentId: selectedParentId,
      });
      onSuccess(
        node.isUnconnected
          ? `Đã xác nhận quan hệ và nối '${node.fullName}' vào phả hệ thành công!`
          : `Đã di chuyển nhánh cho '${node.fullName}' thành công!`
      );
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi di chuyển nhánh.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tree-action-modal-backdrop" onClick={onClose}>
      <div className="tree-action-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* INIT ROOT MODAL (CỤ THỦY TỔ - ĐỜI 1) */}
        {(type === 'initRoot' || type === 'addRoot') && (
          <form onSubmit={handleInitRootSubmit}>
            <div className="tree-action-modal-header">
              <h3 className="tree-action-modal-title">
                Khởi tạo Cây Gia Phả - Thêm Cụ Thủy Tổ (Đời 1)
              </h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}

              <div className="tree-action-helper-box">
                <span>
                  Khởi tạo thành viên đầu tiên để đặt nền móng cho phả hệ dòng tộc <strong>{familyName}</strong>. Sau khi tạo Cụ Thủy Tổ, bạn có thể tiếp tục thêm Vợ/Chồng và Con cháu trực tiếp trên cây.
                </span>
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Họ và tên Cụ Thủy Tổ *</label>
                <input
                  type="text"
                  className="tree-action-form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Cụ Mai Thế An"
                  required
                />
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Giới tính</label>
                  <select
                    className="tree-action-form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Tình trạng</label>
                  <select
                    className="tree-action-form-select"
                    value={isAlive ? 'true' : 'false'}
                    onChange={(e) => setIsAlive(e.target.value === 'true')}
                  >
                    <option value="false">Đã mất</option>
                    <option value="true">Còn sống</option>
                  </select>
                </div>
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Ngày / Năm sinh</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="YYYY-MM-DD hoặc năm YYYY"
                  />
                </div>

                {!isAlive && (
                  <div className="tree-action-form-group">
                    <label className="tree-action-form-label">Ngày / Năm mất</label>
                    <input
                      type="text"
                      className="tree-action-form-input"
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      placeholder="YYYY-MM-DD hoặc năm YYYY"
                    />
                  </div>
                )}
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Tiểu sử / Công trạng</label>
                <textarea
                  className="tree-action-form-textarea"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ghi chép về quê quán, công đức, phần mộ hoặc thông tin lưu truyền..."
                />
              </div>
            </div>

            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
              <button type="submit" className="tree-action-btn-primary" disabled={loading}>
                {loading ? 'Đang khởi tạo...' : 'Khởi tạo Cụ Thủy Tổ'}
              </button>
            </div>
          </form>
        )}

        {/* EDIT MODAL */}
        {type === 'edit' && (
          <form onSubmit={handleEditSubmit}>
            <div className="tree-action-modal-header">
              <h3 className="tree-action-modal-title">
                {isSelf ? 'Chỉnh sửa thông tin cá nhân của bạn' : 'Chỉnh sửa thành viên'}
              </h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}
              
              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Họ và tên *</label>
                <input
                  type="text"
                  className="tree-action-form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  required
                />
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Giới tính</label>
                  <select
                    className="tree-action-form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Tình trạng</label>
                  <select
                    className="tree-action-form-select"
                    value={isAlive ? 'true' : 'false'}
                    onChange={(e) => setIsAlive(e.target.value === 'true')}
                  >
                    <option value="true">Còn sống</option>
                    <option value="false">Đã mất</option>
                  </select>
                </div>
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Năm sinh / Ngày sinh</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="YYYY hoặc YYYY-MM-DD"
                  />
                </div>

                {!isAlive && (
                  <div className="tree-action-form-group">
                    <label className="tree-action-form-label">Ngày mất</label>
                    <input
                      type="text"
                      className="tree-action-form-input"
                      value={deathDate}
                      onChange={(e) => setDeathDate(e.target.value)}
                      placeholder="YYYY hoặc YYYY-MM-DD"
                    />
                  </div>
                )}
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Ghi chú / Tiểu sử</label>
                <textarea
                  className="tree-action-form-textarea"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tiểu sử, chức vị, nơi an táng..."
                />
              </div>
            </div>
            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
              <button type="submit" className="tree-action-btn-primary" disabled={loading}>
                {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        )}

        {/* DELETE MODAL */}
        {type === 'delete' && (
          <div>
            <div className="tree-action-modal-header danger">
              <h3 className="tree-action-modal-title">Xóa nhân vật khỏi cây gia phả</h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}
              <p style={{ fontSize: '15px', color: '#1e293b', margin: 0 }}>
                Bạn có chắc chắn muốn xóa nhân vật <strong>{node.fullName}</strong> (Đời thứ {node.generation || 1}) khỏi sơ đồ cây gia phả <strong>{familyName || 'dòng tộc'}</strong> không?
              </p>
              <div className="tree-action-helper-box" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
                <strong>Lưu ý:</strong> Thao tác này chỉ xóa hồ sơ nhân vật và giải phóng các liên kết cha-con, vợ-chồng trên cây gia phả. Tài khoản người dùng liên kết (nếu có) vẫn được bảo lưu trong dòng tộc ở trạng thái chưa nối phả hệ. Để khai trừ tài khoản ra khỏi tộc, vui lòng thực hiện tại mục <em>Quản lý dòng họ &gt; Phân quyền &amp; Tài khoản</em>.
              </div>
            </div>
            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy bỏ</button>
              <button type="button" className="tree-action-btn-primary danger" onClick={handleDeleteSubmit} disabled={loading}>
                {loading ? 'Đang xóa...' : 'Xác nhận xóa khỏi cây'}
              </button>
            </div>
          </div>
        )}

        {/* ADD CHILD MODAL */}
        {type === 'addChild' && (
          <form onSubmit={handleAddChildSubmit}>
            <div className="tree-action-modal-header">
              <h3 className="tree-action-modal-title">Thêm người con mới</h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}
              
              <div className="tree-action-helper-box">
                Thiết lập người con trực hệ cho <strong>{node.fullName}</strong>. Người con sẽ tự động được xếp vào <strong>Đời thứ {(node.generation || 1) + 1}</strong>.
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Họ và tên con *</label>
                <input
                  type="text"
                  className="tree-action-form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn Bảo"
                  required
                />
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Giới tính</label>
                  <select
                    className="tree-action-form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                  </select>
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Năm sinh / Ngày sinh</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="YYYY hoặc YYYY-MM-DD"
                  />
                </div>
              </div>
            </div>
            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
              <button type="submit" className="tree-action-btn-primary" disabled={loading}>
                {loading ? 'Đang thêm...' : 'Tạo người con'}
              </button>
            </div>
          </form>
        )}

        {/* ADD SPOUSE MODAL */}
        {type === 'addSpouse' && (
          <form onSubmit={handleAddSpouseSubmit}>
            <div className="tree-action-modal-header">
              <h3 className="tree-action-modal-title">Thêm Vợ/Chồng (Hôn phối)</h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}
              
              <div className="tree-action-helper-box">
                Thiết lập hôn phối cho <strong>{node.fullName}</strong> ({node.gender === 'female' ? 'Nữ' : 'Nam'}, Đời thứ {node.generation || 1}).
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">Họ và tên Vợ/Chồng *</label>
                <input
                  type="text"
                  className="tree-action-form-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={node.gender === 'female' ? 'Ví dụ: Trần Văn Nam (Chồng)' : 'Ví dụ: Lê Thị Mai (Vợ)'}
                  required
                />
              </div>

              <div className="tree-action-form-row">
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Giới tính</label>
                  <select
                    className="tree-action-form-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  >
                    <option value="male">Nam (Chồng)</option>
                    <option value="female">Nữ (Vợ/Dâu)</option>
                  </select>
                </div>

                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Năm sinh / Ngày sinh</label>
                  <input
                    type="text"
                    className="tree-action-form-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="YYYY hoặc YYYY-MM-DD"
                  />
                </div>
              </div>
            </div>
            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
              <button type="submit" className="tree-action-btn-primary" disabled={loading}>
                {loading ? 'Đang thêm...' : 'Tạo Vợ/Chồng'}
              </button>
            </div>
          </form>
        )}

        {/* RELOCATE MODAL */}
        {type === 'relocate' && (
          <form onSubmit={handleRelocateSubmit}>
            <div className="tree-action-modal-header">
              <h3 className="tree-action-modal-title">
                {node.isUnconnected ? 'Xác nhận quan hệ / Nối vào cây phả hệ' : 'Di chuyển nhánh / Đổi cha mẹ'}
              </h3>
              <button type="button" className="tree-action-modal-close-btn" onClick={onClose}>✕</button>
            </div>
            <div className="tree-action-modal-body">
              {error && <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>{error}</div>}
              
              <div className="tree-action-helper-box">
                {node.isUnconnected ? (
                  <span>
                    Chọn cha hoặc mẹ trong dòng họ để kết nối thành viên <strong>{node.fullName}</strong> vào nhánh gia phả. Sau khi lưu, đường nối liên kết quan hệ trong cây sẽ tự động hiển thị.
                  </span>
                ) : (
                  <span>
                    Chọn người cha/mẹ mới trong dòng họ để chuyển nhánh phả hệ cho <strong>{node.fullName}</strong>.
                  </span>
                )}
              </div>

              <div className="tree-action-form-group">
                <label className="tree-action-form-label">
                  {node.isUnconnected ? 'Chọn Cha/Mẹ trong dòng tộc để nối *' : 'Chọn Cha/Mẹ mới *'}
                </label>
                <select
                  className="tree-action-form-select"
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  required
                >
                  {allMembers
                    .filter((m) => m.id !== node.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.gender === 'female' ? 'Nữ' : 'Nam'}, Đời thứ {m.generation || 1})
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="tree-action-modal-footer">
              <button type="button" className="tree-action-btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
              <button type="submit" className="tree-action-btn-primary" disabled={loading}>
                {loading
                  ? (node.isUnconnected ? 'Đang kết nối...' : 'Đang chuyển...')
                  : (node.isUnconnected ? 'Xác nhận nối quan hệ' : 'Xác nhận di chuyển')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TreeActionModals;
