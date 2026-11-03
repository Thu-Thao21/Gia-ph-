import React, { useEffect, useRef, useState } from 'react';
import { readApiError } from '../../api/apiError';
import { deleteAncestorPortrait, uploadAncestorPortrait } from '../../services/genealogy.service';
import type { AncestorRecord } from './ancestralExperience.data';
import './AncestorPortraitUpload.css';

interface Props {
  familyId: string;
  ancestor: AncestorRecord;
  onSaved: (personId: string, portraitUrl: string | null) => void;
}

export function AncestorPortraitUpload({ familyId, ancestor, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!selection) return;
    dialogRef.current?.showModal();
    return () => URL.revokeObjectURL(selection.preview);
  }, [selection]);

  const close = () => {
    if (saving) return;
    dialogRef.current?.close();
    setSelection(null);
    setConfirmDelete(false);
    setError('');
  };

  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setImageReady(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError('Ảnh phải có dung lượng lớn hơn 0 và không quá 2 MB.');
      return;
    }
    setImageReady(false);
    setSelection({ file, preview: URL.createObjectURL(file) });
  };

  const save = async () => {
    if (saving || (!confirmDelete && (!selection || !imageReady))) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setSaving(true);
    setError('');
    try {
      const result = confirmDelete
        ? await deleteAncestorPortrait(familyId, ancestor.id, controller.signal)
        : await uploadAncestorPortrait(familyId, ancestor.id, selection!.file, controller.signal);
      if (controller.signal.aborted) return;
      onSaved(result.personId, result.avatarUrl);
      dialogRef.current?.close();
      setSelection(null);
      setConfirmDelete(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      const info = readApiError(err);
      setError(info.status === 403
        ? 'Bạn không có quyền cập nhật ảnh cho tiền nhân này. Vui lòng liên hệ trưởng tộc.'
        : info.message || (confirmDelete ? 'Chưa xóa được ảnh. Vui lòng thử lại.' : 'Chưa lưu được ảnh. Vui lòng kiểm tra kết nối và thử lại.'));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  };

  return (
    <div className="ancestor-photo-upload">
      <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={chooseFile} aria-label={`Chọn ảnh thờ cho ${ancestor.name}`} />
      <button type="button" className="ancestral-secondary-button ancestor-photo-button" onClick={() => inputRef.current?.click()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {ancestor.portraitUrl ? 'Thay ảnh thờ' : 'Tải ảnh thờ lên'}
      </button>
      {ancestor.portraitUrl && (
        <button type="button" className="ancestor-photo-delete-button" onClick={() => {
          setError('');
          setConfirmDelete(true);
          dialogRef.current?.showModal();
        }}>
          Xóa ảnh thờ
        </button>
      )}
      <small>JPG, PNG, WebP · Tối đa 2 MB</small>
      {error && !selection && !confirmDelete && <p className="ancestor-photo-error" role="alert">{error}</p>}

      <dialog ref={dialogRef} className="ancestral-modal ancestor-photo-dialog" aria-labelledby="ancestor-photo-title" onCancel={(event) => { event.preventDefault(); close(); }}>
        <div className="ancestral-modal-header">
          <div>
            <span>ẢNH THỜ TIỀN NHÂN</span>
            <h2 id="ancestor-photo-title">{confirmDelete ? 'Xóa ảnh thờ?' : ancestor.portraitUrl ? 'Thay ảnh thờ' : 'Tải ảnh thờ lên'}</h2>
            <p>{ancestor.name}</p>
          </div>
          <button type="button" disabled={saving} onClick={close} aria-label="Đóng hộp thoại ảnh thờ">×</button>
        </div>
        {selection && (
          <figure className="ancestor-photo-preview">
            <div className="ancestor-portrait">
              <img src={selection.preview} alt={`Xem trước ảnh thờ của ${ancestor.name}`} onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                const valid = Math.min(naturalWidth, naturalHeight) >= 16 && Math.max(naturalWidth, naturalHeight) <= 4096;
                setImageReady(valid);
                if (!valid) setError('Chiều rộng và chiều cao ảnh phải từ 16 đến 4096 pixel.');
              }} onError={() => { setImageReady(false); setError('Không đọc được ảnh. Vui lòng chọn một tệp ảnh khác.'); }} />
            </div>
            <figcaption>{selection.file.name}</figcaption>
          </figure>
        )}
        <p className="ancestor-photo-hint">{confirmDelete
          ? 'Ảnh sẽ được gỡ khỏi phòng thờ và hồ sơ của tiền nhân. Bạn có thể tải ảnh mới lên bất cứ lúc nào.'
          : 'Ảnh sẽ hiển thị trong phòng thờ và hồ sơ của tiền nhân sau khi lưu.'}</p>
        {error && (selection || confirmDelete) && <p className="ancestor-photo-error" role="alert">{error}</p>}
        <div className="ancestral-modal-actions">
          <button type="button" className="ancestral-cancel-button" disabled={saving} onClick={close}>Hủy</button>
          {confirmDelete ? (
            <button type="button" className="ancestral-delete-button" disabled={saving} onClick={save}>{saving ? 'Đang xóa ảnh…' : 'Xác nhận xóa ảnh'}</button>
          ) : <>
            <button type="button" className="ancestral-secondary-button" disabled={saving} onClick={() => inputRef.current?.click()}>Chọn ảnh khác</button>
            <button type="button" className="ancestral-confirm-button" disabled={saving || !imageReady} onClick={save}>{saving ? 'Đang lưu ảnh…' : 'Lưu ảnh thờ'}</button>
          </>}
        </div>
      </dialog>
    </div>
  );
}
