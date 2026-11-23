import React, { useEffect, useRef } from 'react';
import { formatSolarDate } from './lunarCalendar';

export interface InfoCardAncestor {
  name: string;
  generation: number;
  birthDate?: string | null;
  deathDate?: string | null;
  note?: string | null;
}

const orUnknown = (raw?: string | null): string => formatSolarDate(raw) || 'Chưa rõ';

/**
 * Thẻ thông tin hiện khi camera tiến sát một ảnh thờ: họ tên, đời, ngày sinh, ngày mất, ghi chú.
 * Nút "Đóng" nhận tiêu điểm khi mở (phím Esc và bấm ra ngoài cảnh cũng đóng được).
 */
export const AncestorInfoCard: React.FC<{
  ancestor: InfoCardAncestor;
  /** Ví dụ "17 tháng 1 âm lịch" khi hôm nay là ngày giỗ; null thì không hiện dòng ngày giỗ. */
  memorialToday?: string | null;
  onClose: () => void;
}> = ({ ancestor, memorialToday, onClose }) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [ancestor.name]);

  const note = ancestor.note ? ancestor.note.trim() : '';
  return (
    <aside className="hall3d-infocard" role="region" aria-label={`Thông tin của ${ancestor.name}`} aria-live="polite">
      <header>
        <div>
          <strong>{ancestor.name}</strong>
          <span>Đời thứ {ancestor.generation}</span>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng thẻ thông tin">
          Đóng
        </button>
      </header>
      {memorialToday && (
        <p className="hall3d-infocard-memorial" role="status">
          Hôm nay là ngày giỗ ({memorialToday})
        </p>
      )}
      <dl>
        <div>
          <dt>Ngày sinh</dt>
          <dd>{orUnknown(ancestor.birthDate)}</dd>
        </div>
        <div>
          <dt>Ngày mất</dt>
          <dd>{orUnknown(ancestor.deathDate)}</dd>
        </div>
      </dl>
      <p className="hall3d-infocard-note">{note || 'Chưa có ghi chú.'}</p>
    </aside>
  );
};
