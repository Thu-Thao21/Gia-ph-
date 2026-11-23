import React, { useEffect, useState } from 'react';

export interface MobileTreeControlsProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  /** Trả về false nếu không tìm thấy thẻ của người dùng trong cây đang hiển thị. */
  onFindMe: () => boolean;
}

/** Nhóm nút nổi góc phải dưới (phía trên tab bar và nút AI) cho cây gia phả trên mobile. */
export const MobileTreeControls: React.FC<MobileTreeControlsProps> = ({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onCenter,
  onFindMe,
}) => {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2400);
    return () => window.clearTimeout(t);
  }, [hint]);

  return (
    <>
      <div className="tree-mobile-controls" role="toolbar" aria-label="Điều khiển cây gia phả">
        <button type="button" className="tree-mobile-ctrl-btn" onClick={onZoomIn} aria-label="Phóng to">
          +
        </button>
        <div className="tree-mobile-ctrl-zoom" aria-live="polite">{zoomPercent}%</div>
        <button type="button" className="tree-mobile-ctrl-btn" onClick={onZoomOut} aria-label="Thu nhỏ">
          −
        </button>
        <button type="button" className="tree-mobile-ctrl-btn" onClick={onCenter} aria-label="Về giữa" title="Về giữa">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
        <button
          type="button"
          className="tree-mobile-ctrl-btn"
          onClick={() => {
            if (!onFindMe()) setHint('Không thấy bạn trong cây đang hiển thị');
          }}
          aria-label="Tìm tôi"
          title="Tìm tôi"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        </button>
      </div>
      {hint && <div className="tree-mobile-ctrl-hint" role="status">{hint}</div>}
    </>
  );
};

export default MobileTreeControls;
