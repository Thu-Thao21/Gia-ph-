import React, { useRef, useState } from 'react';
import {
  deleteHallCover,
  deleteTabletPortrait,
  uploadHallCover,
  uploadTabletPortrait,
  type TabletItem,
} from '../../../services/worshipHall.service';
import { ImageCropper } from './ImageCropper';
import { AuthImage, InlineConfirm, TabletThumb, type ManageCtx } from './ManageShared';
import {
  ACCEPTED_IMAGE_TYPES,
  COVER_ASPECT,
  COVER_OUTPUT_WIDTH,
  PORTRAIT_ASPECT,
  PORTRAIT_OUTPUT_WIDTH,
  validateImageFile,
} from './imageTools';

type Target = { kind: 'cover' } | { kind: 'portrait'; tablet: TabletItem };

/** Tab "Ảnh": ảnh chân dung từng bài vị (cắt theo khung 3:4) và ảnh bìa phòng (16:9). */
export const ImagesTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pending = useRef<Target | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ target: Target; file: File } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null); // 'cover' hoặc 'portrait-<id>'

  const choose = (target: Target) => {
    pending.current = target;
    setFileError(null);
    ctx.clearError();
    inputRef.current?.click();
  };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // cho phép chọn lại đúng tệp đó sau khi sửa
    const target = pending.current;
    if (!file || !target) return;
    const problem = validateImageFile(file);
    if (problem) {
      setFileError(problem);
      return;
    }
    setCrop({ target, file });
    ctx.lockClose(true);
  };

  const closeCrop = () => {
    setCrop(null);
    ctx.lockClose(false);
  };

  const upload = async (blob: Blob) => {
    if (!crop) return;
    const { target } = crop;
    const key = target.kind === 'cover' ? 'up-cover' : `up-${target.tablet.id}`;
    const send = (): Promise<unknown> =>
      target.kind === 'cover'
        ? uploadHallCover(ctx.clanId, blob)
        : uploadTabletPortrait(ctx.clanId, target.tablet.id, blob);
    const done = await ctx.run(
      key,
      send,
      target.kind === 'cover' ? 'Đã cập nhật ảnh bìa phòng thờ.' : `Đã cập nhật ảnh của ${target.tablet.fullName}.`
    );
    if (done) closeCrop();
  };

  const removeCover = async () => {
    const done = await ctx.run('del-cover', () => deleteHallCover(ctx.clanId), 'Đã xóa ảnh bìa.');
    if (done) setConfirm(null);
  };
  const removePortrait = async (tablet: TabletItem) => {
    const done = await ctx.run(`delimg-${tablet.id}`, () => deleteTabletPortrait(ctx.clanId, tablet.id), `Đã xóa ảnh của ${tablet.fullName}.`);
    if (done) setConfirm(null);
  };

  const cover = ctx.hall.hall.coverImageUrl;
  const uploadingKey = ctx.busyKey?.startsWith('up-') ? ctx.busyKey : null;

  return (
    <div className="wm-images">
      <input
        ref={inputRef}
        type="file"
        className="wm-sr"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={onFile}
        tabIndex={-1}
        aria-hidden="true"
      />
      <p className="wm-hint">Ảnh JPG, PNG hoặc WebP, tối đa 5 MB. Sau khi chọn ảnh, kéo khung để chọn vùng khuôn mặt rồi mới tải lên.</p>
      {fileError && <p className="wm-error" role="alert">{fileError}</p>}

      <section className="wm-card" aria-labelledby="wm-cover-title">
        <h3 id="wm-cover-title">Ảnh bìa phòng thờ</h3>
        <div className="wm-cover-row">
          <div className="wm-cover-preview">
            {cover ? <AuthImage src={cover} alt="Ảnh bìa phòng thờ" fallbackText="Bìa" className="wm-cover-img" /> : <span>Chưa có ảnh bìa</span>}
          </div>
          <div className="wm-inline-actions">
            <button type="button" className="wm-btn wm-btn-primary" onClick={() => choose({ kind: 'cover' })} disabled={ctx.busyKey !== null}>
              {cover ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}
            </button>
            {cover && confirm !== 'cover' && (
              <button type="button" className="wm-btn wm-btn-danger-ghost" onClick={() => setConfirm('cover')} disabled={ctx.busyKey !== null}>
                Xóa ảnh bìa
              </button>
            )}
          </div>
        </div>
        {confirm === 'cover' && (
          <InlineConfirm
            message="Xóa ảnh bìa của phòng thờ?"
            confirmLabel="Xác nhận xóa"
            busy={ctx.busyKey === 'del-cover'}
            onConfirm={() => void removeCover()}
            onCancel={() => setConfirm(null)}
          />
        )}
      </section>

      <section className="wm-card" aria-labelledby="wm-portrait-title">
        <h3 id="wm-portrait-title">Ảnh chân dung bài vị</h3>
        {ctx.tablets.length === 0 ? (
          <p className="wm-empty">Chưa có bài vị để gắn ảnh.</p>
        ) : (
          <ul className="wm-list">
            {ctx.tablets.map((tablet) => {
              const hasImage = !!(tablet.portraitUrl || tablet.thumbnailUrl);
              const key = `portrait-${tablet.id}`;
              return (
                <li key={tablet.id} className="wm-row">
                  <TabletThumb tablet={tablet} />
                  <div className="wm-row-main">
                    <strong>{tablet.fullName}</strong>
                    <small>{uploadingKey === `up-${tablet.id}` ? 'Đang tải ảnh lên…' : hasImage ? 'Đã có ảnh' : 'Chưa có ảnh'}</small>
                  </div>
                  {confirm !== key && (
                    <div className="wm-row-actions">
                      <button type="button" className="wm-btn" onClick={() => choose({ kind: 'portrait', tablet })} disabled={ctx.busyKey !== null}>
                        {hasImage ? 'Đổi ảnh' : 'Tải ảnh'}
                      </button>
                      {hasImage && (
                        <button type="button" className="wm-btn wm-btn-danger-ghost" onClick={() => setConfirm(key)} disabled={ctx.busyKey !== null}>
                          Xóa ảnh
                        </button>
                      )}
                    </div>
                  )}
                  {confirm === key && (
                    <InlineConfirm
                      message={`Xóa ảnh chân dung của ${tablet.fullName}?`}
                      confirmLabel="Xác nhận xóa"
                      busy={ctx.busyKey === `delimg-${tablet.id}`}
                      onConfirm={() => void removePortrait(tablet)}
                      onCancel={() => setConfirm(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {crop && (
        <ImageCropper
          file={crop.file}
          aspect={crop.target.kind === 'cover' ? COVER_ASPECT : PORTRAIT_ASPECT}
          outputWidth={crop.target.kind === 'cover' ? COVER_OUTPUT_WIDTH : PORTRAIT_OUTPUT_WIDTH}
          title={crop.target.kind === 'cover' ? 'Cắt ảnh bìa phòng thờ' : `Cắt ảnh của ${crop.target.tablet.fullName}`}
          hint={
            crop.target.kind === 'cover'
              ? 'Kéo khung để chọn phần ảnh làm bìa (tỉ lệ 16:9).'
              : 'Kéo khung vào vùng khuôn mặt (tỉ lệ 3:4, đúng khung ảnh thờ).'
          }
          busy={uploadingKey !== null}
          error={ctx.errorMessage}
          onCancel={closeCrop}
          onConfirm={(blob) => void upload(blob)}
        />
      )}
    </div>
  );
};
