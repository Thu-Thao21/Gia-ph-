import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useClanContext } from '../../context/ClanContext';
import {
  ANCESTOR_RECORDS,
  ANCESTRAL_MEDIA,
  MEDIA_TYPE_OPTIONS,
  getAncestorById,
  type AncestralMediaItem,
  type AncestralMediaType,
} from './ancestralExperience.data';
import './AncestralLibraryModule.css';

type LibraryView = 'grid' | 'list';

export interface AncestralLibraryModuleProps {
  initialAncestorId?: string;
  onOpenWorship?: (ancestorId: string) => void;
}

const getMediaSymbol = (type: AncestralMediaType) => {
  if (type === 'Ảnh 360°') return '360°';
  if (type === 'Video') return '▶';
  if (type === 'Âm thanh') return '♪';
  if (type === 'Tài liệu') return '▤';
  return '▧';
};

const ViewerArtwork: React.FC<{
  item: AncestralMediaItem;
  zoom: number;
  rotation: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
}> = ({ item, zoom, rotation, isPlaying, onTogglePlay }) => {
  const transform = `scale(${zoom}) rotateY(${rotation}deg)`;

  if (item.type === 'Ảnh 360°') {
    return (
      <div className="viewer-artwork viewer-artwork-panorama" style={{ transform }}>
        <div className="panorama-ceiling" />
        <div className="panorama-wall panorama-wall-left" />
        <div className="panorama-wall panorama-wall-right" />
        <div className="panorama-window panorama-window-left"><i /><i /><i /></div>
        <div className="panorama-window panorama-window-right"><i /><i /><i /></div>
        <div className="panorama-altar">
          <span className="panorama-crest">福</span>
          <strong>TỪ ĐƯỜNG</strong>
          <small>TỘC HỌ NGUYỄN</small>
        </div>
        <div className="panorama-floor" />
        <div className="panorama-hotspot hotspot-one"><span>+</span><small>Bài vị</small></div>
        <div className="panorama-hotspot hotspot-two"><span>+</span><small>Gia phả cổ</small></div>
      </div>
    );
  }

  if (item.type === 'Ảnh tư liệu') {
    const ancestor = getAncestorById(item.ancestorId);
    return (
      <div className={`viewer-artwork viewer-artwork-photo viewer-photo-${item.accent}`} style={{ transform }}>
        <div className="viewer-photo-frame">
          <div className="viewer-photo-silhouette"><span /><i /></div>
          <strong>{ancestor.initials}</strong>
          <small>ẢNH TƯ LIỆU GIA TỘC</small>
        </div>
      </div>
    );
  }

  if (item.type === 'Tài liệu') {
    return (
      <div className="viewer-artwork viewer-artwork-document" style={{ transform }}>
        <div className="viewer-document-page">
          <span>譜 系</span>
          <h3>NGUYỄN TỘC GIA PHẢ</h3>
          <i /><i /><i /><i /><i />
          <small>Bản số hóa · Trang 01</small>
        </div>
      </div>
    );
  }

  if (item.type === 'Âm thanh') {
    return (
      <div className="viewer-artwork viewer-artwork-audio" style={{ transform }}>
        <button type="button" className={isPlaying ? 'is-playing' : ''} onClick={onTogglePlay} aria-label={isPlaying ? 'Tạm dừng âm thanh' : 'Phát âm thanh'}>
          {isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <div className={`viewer-audio-wave ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
          {Array.from({ length: 28 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 35}ms` }} />)}
        </div>
        <strong>Chuyện kể gia tộc</strong>
        <small>{item.duration || 'Âm thanh lưu trữ'}</small>
      </div>
    );
  }

  return (
    <div className="viewer-artwork viewer-artwork-video" style={{ transform }}>
      <div className="viewer-video-scene">
        <span className="viewer-video-lantern left" /><span className="viewer-video-lantern right" />
        <div className="viewer-video-altar">TỪ ĐƯỜNG</div>
      </div>
      <button type="button" className={isPlaying ? 'is-playing' : ''} onClick={onTogglePlay} aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'}>
        {isPlaying ? 'Ⅱ' : '▶'}
      </button>
      <div className="viewer-video-progress"><i className={isPlaying ? 'is-playing' : ''} /></div>
      <span>{isPlaying ? 'Đang phát bản trình diễn' : 'Nhấn để xem bản trình diễn'}</span>
    </div>
  );
};

export const AncestralLibraryModule: React.FC<AncestralLibraryModuleProps> = ({
  initialAncestorId,
  onOpenWorship,
}) => {
  const { activeClanName } = useClanContext();

  if (!ANCESTRAL_MEDIA || ANCESTRAL_MEDIA.length === 0) {
    return (
      <section className="ancestral-library-page" aria-labelledby="ancestral-library-title">
        <header className="ancestral-library-header">
          <div>
            <span>DI SẢN SỐ GIA TỘC</span>
            <h1 id="ancestral-library-title">Thư Viện Tổ Tiên · {activeClanName || 'Dòng Họ'}</h1>
            <p>Khám phá không gian, hình ảnh và tư liệu tiền nhân qua trình xem tương tác.</p>
          </div>
          <div className="ancestral-library-summary">
            <div><strong>0</strong><span>Tư liệu</span></div>
            <div><strong>0</strong><span>Tiền nhân</span></div>
          </div>
        </header>
        <div style={{ padding: '60px 24px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', margin: '24px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏛️</div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Chưa có tư liệu hoặc hiện vật số nào</h3>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '560px', margin: '0 auto' }}>
            Dòng tộc {activeClanName || 'hiện tại'} chưa có tư liệu, tranh ảnh hoặc hiện vật số nào được tải lên từ cơ sở dữ liệu.
          </p>
        </div>
      </section>
    );
  }

  const initialMedia = ANCESTRAL_MEDIA.find((item) => item.ancestorId === initialAncestorId) || ANCESTRAL_MEDIA[0];
  const [selectedMediaId, setSelectedMediaId] = useState(initialMedia.id);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'Tất cả' | AncestralMediaType>('Tất cả');
  const [viewMode, setViewMode] = useState<LibraryView>('grid');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSimulatedFullscreen, setIsSimulatedFullscreen] = useState(false);

  const viewerRef = useRef<HTMLElement | null>(null);
  const selectedMedia = ANCESTRAL_MEDIA.find((item) => item.id === selectedMediaId) || ANCESTRAL_MEDIA[0];
  const selectedAncestor = getAncestorById(selectedMedia.ancestorId) || { initials: 'TN', name: 'Tiền nhân' };

  const filteredMedia = useMemo(() => {
    const needle = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return ANCESTRAL_MEDIA.filter((item) => {
      const ancestor = getAncestorById(item.ancestorId) || { name: '' };
      const matchesType = typeFilter === 'Tất cả' || item.type === typeFilter;
      const haystack = `${item.title} ${item.description} ${item.source} ${ancestor.name}`.toLocaleLowerCase('vi-VN');
      return matchesType && (!needle || haystack.includes(needle));
    });
  }, [searchTerm, typeFilter]);

  const viewerSequence = filteredMedia.length > 0 ? filteredMedia : ANCESTRAL_MEDIA;
  const selectedPosition = viewerSequence.findIndex((item) => item.id === selectedMedia.id);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === viewerRef.current);
    const closeSimulatedFullscreen = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSimulatedFullscreen(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('keydown', closeSimulatedFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('keydown', closeSimulatedFullscreen);
    };
  }, []);

  const selectMedia = (mediaId: string) => {
    setSelectedMediaId(mediaId);
    setZoom(1);
    setRotation(0);
    setIsPlaying(false);
  };

  const browseMedia = (direction: number) => {
    const currentIndex = selectedPosition >= 0 ? selectedPosition : 0;
    const nextIndex = (currentIndex + direction + viewerSequence.length) % viewerSequence.length;
    selectMedia(viewerSequence[nextIndex].id);
  };

  const changeZoom = (amount: number) => {
    setZoom((current) => Math.min(1.8, Math.max(0.65, Number((current + amount).toFixed(2)))));
  };

  const toggleFullscreen = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    try {
      if (document.fullscreenElement === viewer) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        await viewer.requestFullscreen();
      } else {
        await viewer.requestFullscreen();
      }
      setIsSimulatedFullscreen(false);
    } catch {
      setIsSimulatedFullscreen((current) => !current);
    }
  };

  const handleViewerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') browseMedia(-1);
    if (event.key === 'ArrowRight') browseMedia(1);
    if (event.key === '+' || event.key === '=') changeZoom(0.1);
    if (event.key === '-') changeZoom(-0.1);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('Tất cả');
  };

  return (
    <section className="ancestral-library-page" aria-labelledby="ancestral-library-title">
      <header className="ancestral-library-header">
        <div>
          <span>DI SẢN SỐ GIA TỘC</span>
          <h1 id="ancestral-library-title">Thư Viện Tổ Tiên 3D / 360°</h1>
          <p>Khám phá không gian, hình ảnh và tư liệu tiền nhân qua trình xem tương tác.</p>
        </div>
        <div className="ancestral-library-summary">
          <div><strong>{ANCESTRAL_MEDIA.length}</strong><span>Tư liệu</span></div>
          <div><strong>{ANCESTOR_RECORDS.length}</strong><span>Tiền nhân</span></div>
        </div>
      </header>

      <section
        ref={viewerRef}
        className={`ancestral-viewer-card ${isSimulatedFullscreen ? 'is-simulated-fullscreen' : ''}`}
        aria-label="Trình xem tư liệu tổ tiên"
      >
        <header className="ancestral-viewer-header">
          <div>
            <span className={`viewer-media-type viewer-media-type-${selectedMedia.accent}`}>{selectedMedia.type}</span>
            <strong>{selectedMedia.title}</strong>
          </div>
          <div className="viewer-media-counter">
            {Math.max(1, selectedPosition + 1)} / {viewerSequence.length}
          </div>
        </header>

        <div className="ancestral-viewer-layout">
          <div
            className="ancestral-viewer-stage"
            role="application"
            aria-label={`${selectedMedia.title}. Dùng phím mũi tên để chuyển tư liệu, phím cộng hoặc trừ để thu phóng.`}
            tabIndex={0}
            onKeyDown={handleViewerKeyDown}
          >
            <div className="viewer-demo-badge">BẢN TRÌNH DIỄN {selectedMedia.type === 'Ảnh 360°' ? '360°' : 'SỐ HÓA'}</div>
            <ViewerArtwork
              item={selectedMedia}
              zoom={zoom}
              rotation={rotation}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((current) => !current)}
            />
            <button type="button" className="viewer-stage-nav previous" onClick={() => browseMedia(-1)} aria-label="Tư liệu trước">‹</button>
            <button type="button" className="viewer-stage-nav next" onClick={() => browseMedia(1)} aria-label="Tư liệu tiếp theo">›</button>
            <div className="viewer-stage-hint">Kéo tưởng tượng để quan sát · Xoay {rotation}° · Thu phóng {Math.round(zoom * 100)}%</div>
          </div>

          <aside className="ancestral-viewer-info" aria-label="Thông tin tư liệu và tiền nhân">
            <div className="viewer-info-section">
              <span>THÔNG TIN TƯ LIỆU</span>
              <h2>{selectedMedia.title}</h2>
              <p>{selectedMedia.description}</p>
              <dl>
                <div><dt>Loại</dt><dd>{selectedMedia.type}</dd></div>
                <div><dt>Niên đại</dt><dd>{selectedMedia.capturedAt}</dd></div>
                <div><dt>Nguồn</dt><dd>{selectedMedia.source}</dd></div>
                {selectedMedia.duration && <div><dt>Thời lượng</dt><dd>{selectedMedia.duration}</dd></div>}
              </dl>
            </div>

            <div className="viewer-ancestor-card">
              <div className={`viewer-ancestor-avatar avatar-${selectedAncestor.portraitTone}`} aria-hidden="true">{selectedAncestor.initials}</div>
              <div>
                <span>TIỀN NHÂN LIÊN QUAN</span>
                <strong>{selectedAncestor.name}</strong>
                <small>{selectedAncestor.title} · {selectedAncestor.birthYear}—{selectedAncestor.deathYear}</small>
              </div>
              <p>{selectedAncestor.memorialDate}</p>
              {onOpenWorship && (
                <button type="button" onClick={() => onOpenWorship(selectedAncestor.id)}>Đến không gian tưởng niệm</button>
              )}
            </div>
          </aside>
        </div>

        <div className="ancestral-viewer-controls" aria-label="Điều khiển trình xem">
          <div className="viewer-control-group">
            <span>Thu phóng</span>
            <button type="button" onClick={() => changeZoom(-0.1)} disabled={zoom <= 0.65} aria-label="Thu nhỏ">−</button>
            <output aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output>
            <button type="button" onClick={() => changeZoom(0.1)} disabled={zoom >= 1.8} aria-label="Phóng to">+</button>
            <button type="button" onClick={() => setZoom(1)}>Đặt lại</button>
          </div>
          <div className="viewer-control-group">
            <span>Xoay / 360°</span>
            <button type="button" onClick={() => setRotation((current) => current - 45)} aria-label="Xoay sang trái">↶</button>
            <output aria-label="Góc xoay">{rotation}°</output>
            <button type="button" onClick={() => setRotation((current) => current + 45)} aria-label="Xoay sang phải">↷</button>
          </div>
          <button type="button" className="viewer-fullscreen-button" onClick={toggleFullscreen}>
            <span aria-hidden="true">⛶</span>{isFullscreen || isSimulatedFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          </button>
        </div>

        <div className="ancestral-media-filmstrip" aria-label="Dải ảnh tư liệu">
          {ANCESTRAL_MEDIA.map((item) => (
            <button
              key={item.id}
              type="button"
              className={selectedMedia.id === item.id ? 'active' : ''}
              onClick={() => selectMedia(item.id)}
              aria-label={`Mở ${item.title}`}
            >
              <span className={`filmstrip-thumbnail thumbnail-${item.accent}`} aria-hidden="true">{getMediaSymbol(item.type)}</span>
              <span><strong>{item.title}</strong><small>{getAncestorById(item.ancestorId).name}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section className="ancestral-library-catalog" aria-labelledby="library-catalog-title">
        <div className="library-catalog-header">
          <div>
            <span>THƯ VIỆN TƯ LIỆU</span>
            <h2 id="library-catalog-title">Khám phá bộ sưu tập</h2>
            <p>{filteredMedia.length} / {ANCESTRAL_MEDIA.length} tư liệu phù hợp</p>
          </div>
          <div className="library-catalog-controls">
            <label className="library-search-field">
              <span className="library-visually-hidden">Tìm kiếm tư liệu</span>
              <i aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm tên tư liệu, tiền nhân…"
              />
              {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Xóa từ khóa">×</button>}
            </label>
            <label className="library-filter-field">
              <span className="library-visually-hidden">Lọc theo loại tư liệu</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'Tất cả' | AncestralMediaType)}>
                {MEDIA_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option === 'Tất cả' ? 'Tất cả loại tư liệu' : option}</option>)}
              </select>
            </label>
            <div className="library-view-toggle" aria-label="Kiểu hiển thị">
              <button type="button" className={viewMode === 'grid' ? 'active' : ''} aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} title="Dạng lưới">▦</button>
              <button type="button" className={viewMode === 'list' ? 'active' : ''} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} title="Dạng danh sách">☷</button>
            </div>
          </div>
        </div>

        {filteredMedia.length === 0 ? (
          <div className="ancestral-library-empty">
            <span aria-hidden="true">⌕</span>
            <h3>Không tìm thấy tư liệu phù hợp</h3>
            <p>Hãy thử từ khóa khác hoặc chọn lại loại tư liệu.</p>
            <button type="button" onClick={resetFilters}>Xóa bộ lọc</button>
          </div>
        ) : (
          <div className={`ancestral-library-items view-${viewMode}`}>
            {filteredMedia.map((item) => {
              const ancestor = getAncestorById(item.ancestorId);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ancestral-library-item ${selectedMedia.id === item.id ? 'selected' : ''}`}
                  onClick={() => selectMedia(item.id)}
                >
                  <span className={`library-item-thumbnail thumbnail-${item.accent}`} aria-hidden="true">
                    <i>{getMediaSymbol(item.type)}</i>
                    <small>{item.type}</small>
                  </span>
                  <span className="library-item-copy">
                    <span className="library-item-type">{item.type} · {item.capturedAt}</span>
                    <strong>{item.title}</strong>
                    <small>{ancestor.name} · {ancestor.title}</small>
                    <p>{item.description}</p>
                    <span className="library-item-source">Nguồn: {item.source}{item.duration ? ` · ${item.duration}` : ''}</span>
                  </span>
                  <span className="library-item-open">Mở xem <i aria-hidden="true">›</i></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
};

export default AncestralLibraryModule;
