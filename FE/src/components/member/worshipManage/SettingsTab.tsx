import React, { useEffect, useState } from 'react';
import { updateHall } from '../../../services/worshipHall.service';
import { Switch, type ManageCtx } from './ManageShared';

const TITLE_MAX = 255; // khớp BE (HallUpdate.title)

/** Tab "Cài đặt": tiêu đề phòng, bật/tắt lời viếng, công tắc "Ảnh thờ đen trắng" (portraitGrayscale). */
export const SettingsTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const info = ctx.hall.hall;
  const [title, setTitle] = useState(info.title);

  // Đồng bộ khi hall được tải lại (sau khi lưu, hoặc nơi khác vừa đổi).
  useEffect(() => setTitle(info.title), [info.title]);

  const clean = title.trim();
  const busy = ctx.busyKey !== null;

  return (
    <div className="wm-settings">
      <form
        className="wm-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (!clean || clean === info.title) return;
          void ctx.run('set-title', () => updateHall(ctx.clanId, { title: clean }), 'Đã lưu tiêu đề phòng thờ.');
        }}
      >
        <label className="wm-field">
          <span>Tiêu đề phòng thờ</span>
          <input type="text" value={title} maxLength={TITLE_MAX} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
          <small>{title.length}/{TITLE_MAX} ký tự</small>
        </label>
        <button type="submit" className="wm-btn wm-btn-primary" disabled={busy || !clean || clean === info.title}>
          {ctx.busyKey === 'set-title' ? 'Đang lưu…' : 'Lưu tiêu đề'}
        </button>
      </form>

      <div className="wm-card">
        <Switch
          label="Cho phép viết lời viếng"
          hint="Tắt thì thành viên vẫn thắp hương được nhưng không viết thêm lời viếng."
          checked={info.blessingsEnabled}
          disabled={busy}
          onChange={(next) =>
            void ctx.run('set-blessings', () => updateHall(ctx.clanId, { blessingsEnabled: next }), next ? 'Đã bật lời viếng.' : 'Đã tắt lời viếng.')
          }
        />
        <Switch
          label="Ảnh thờ đen trắng"
          hint="Ảnh chân dung trên bàn thờ 3D hiển thị đen trắng. Ảnh gốc vẫn được giữ nguyên màu."
          checked={info.portraitGrayscale}
          disabled={busy}
          onChange={(next) =>
            void ctx.run(
              'set-gray',
              () => updateHall(ctx.clanId, { portraitGrayscale: next }),
              next ? 'Đã bật ảnh thờ đen trắng.' : 'Đã trả ảnh thờ về màu gốc.'
            )
          }
        />
      </div>
    </div>
  );
};
