import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  computeCropRect,
  cropFrameSize,
  cropToBlob,
  outputSize,
  validateImageSize,
} from './imageTools';

interface ImageCropperProps {
  file: File;
  /** Tỉ lệ rộng/cao của khung cắt (ảnh thờ 3:4, ảnh bìa 16:9). */
  aspect: number;
  /** Chiều rộng tối đa của ảnh sau khi cắt. */
  outputWidth: number;
  title: string;
  hint: string;
  busy: boolean;
  /** Lỗi từ lần tải lên trước (nếu có): hiện ngay trong hộp thoại để người dùng thử lại. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

const PREVIEW_W = 96;

/**
 * Bước cắt ảnh trước khi tải lên: kéo khung (chuột, cảm ứng hoặc phím mũi tên), thu phóng bằng thanh trượt.
 * Cắt bằng canvas, không dùng thư viện ngoài. Khung luôn đúng tỉ lệ của khung ảnh thờ và nằm gọn trong ảnh.
 */
export const ImageCropper: React.FC<ImageCropperProps> = ({
  file,
  aspect,
  outputWidth,
  title,
  hint,
  busy,
  error,
  onCancel,
  onConfirm,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ cx: 0, cy: 0 });
  const [cropError, setCropError] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setNatural(null);
    setLoadError(null);
    setZoom(1);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const rect = useMemo(
    () => (natural ? computeCropRect(natural.w, natural.h, aspect, zoom, center.cx, center.cy) : null),
    [natural, aspect, zoom, center]
  );

  // Xem trước đúng phần sẽ được cắt.
  useEffect(() => {
    const canvas = previewRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !rect) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PREVIEW_W;
    canvas.height = Math.round(PREVIEW_W / aspect);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
  }, [rect, aspect]);

  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    const problem = validateImageSize(img.naturalWidth, img.naturalHeight);
    if (problem) {
      setLoadError(problem);
      return;
    }
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    // Khung đặt giữa, hơi lệch lên trên (ảnh chân dung thường có khuôn mặt ở nửa trên).
    setCenter({ cx: img.naturalWidth / 2, cy: img.naturalHeight * 0.42 });
  };

  const moveBy = (dx: number, dy: number) => {
    setCenter((c) => ({ cx: c.cx + dx, cy: c.cy + dy }));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rect || busy || cropping) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, cx: center.cx, cy: center.cy };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || !natural) return;
    const k = natural.w / stage.getBoundingClientRect().width; // điểm ảnh gốc trên một px màn hình
    setCenter({ cx: drag.cx + (event.clientX - drag.x) * k, cy: drag.cy + (event.clientY - drag.y) * k });
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!natural) return;
    const step = natural.w * 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveBy(move[0], move[1]);
    }
  };

  const confirm = async () => {
    if (!rect || !imgRef.current || busy || cropping) return;
    setCropError(null);
    setCropping(true);
    try {
      const blob = await cropToBlob(imgRef.current, rect, outputSize(rect, aspect, outputWidth));
      onConfirm(blob);
    } catch (err) {
      setCropError(err instanceof Error ? err.message : 'Không cắt được ảnh. Vui lòng thử ảnh khác.');
    } finally {
      setCropping(false);
    }
  };

  const frameStyle = rect && natural
    ? {
        left: `${(rect.sx / natural.w) * 100}%`,
        top: `${(rect.sy / natural.h) * 100}%`,
        width: `${(rect.sw / natural.w) * 100}%`,
        height: `${(rect.sh / natural.h) * 100}%`,
      }
    : undefined;
  const frameInfo = natural ? cropFrameSize(natural.w, natural.h, aspect, zoom) : null;
  const shownError = loadError || cropError || error || null;

  return (
    <div className="wm-cropper-backdrop" role="presentation">
      <div className="wm-cropper" role="dialog" aria-modal="true" aria-labelledby="wm-cropper-title">
        <header>
          <h3 id="wm-cropper-title">{title}</h3>
          <p>{hint}</p>
        </header>

        {url && !loadError && (
          <div className="wm-cropper-body">
            <div className="wm-cropper-stage" ref={stageRef}>
              <img ref={imgRef} src={url} alt="Ảnh đã chọn" onLoad={handleLoad} onError={() => setLoadError('Không đọc được ảnh. Tệp có thể bị hỏng, vui lòng chọn tệp khác.')} draggable={false} />
              {frameStyle && (
                <div
                  className="wm-cropper-frame"
                  style={frameStyle}
                  tabIndex={0}
                  role="group"
                  aria-label="Khung cắt ảnh. Kéo hoặc dùng phím mũi tên để di chuyển."
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={onKeyDown}
                />
              )}
            </div>

            <div className="wm-cropper-side">
              <canvas ref={previewRef} className="wm-cropper-preview" aria-label="Xem trước ảnh sau khi cắt" />
              <small>Xem trước</small>
              <label className="wm-cropper-zoom">
                <span>Thu phóng</span>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  disabled={!natural || busy}
                />
              </label>
              {frameInfo && <small>Vùng cắt: {Math.round(frameInfo.sw)}×{Math.round(frameInfo.sh)} px</small>}
            </div>
          </div>
        )}

        {shownError && <p className="wm-error" role="alert">{shownError}</p>}

        <div className="wm-cropper-actions">
          <button type="button" className="wm-btn" onClick={onCancel} disabled={busy || cropping}>Hủy</button>
          <button type="button" className="wm-btn wm-btn-primary" onClick={confirm} disabled={!rect || busy || cropping || !!loadError}>
            {busy || cropping ? 'Đang tải lên…' : 'Cắt và tải lên'}
          </button>
        </div>
      </div>
    </div>
  );
};
