import { useAuth } from '../../context/AuthContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useClanContext } from '../../context/ClanContext';
import { fetchFamilyPersons } from '../../services/genealogy.service';
import {
  ANCESTOR_RECORDS,
  ANCESTRAL_MEDIA,
  INITIAL_MEMORIAL_MESSAGES,
  type AncestorRecord,
  type MemorialMessageRecord,
} from './ancestralExperience.data';
import './DigitalAncestralHallModule.css';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';

// Three.js chỉ được tải khi người dùng vào chế độ Phòng thờ 3D (không nằm trong bundle chính).
const AncestralHall3D = React.lazy(() => import('./AncestralHall3D'));

// Kiểm tra nhanh WebGL, cố ý không import tĩnh từ AncestralHall3D để không kéo three vào bundle chính.
const detectWebGL = (): boolean => {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!(window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext) return false;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
};

// Danh sách rỗng ổn định cho cảnh 3D khi chưa có tiền nhân.
const NO_ANCESTORS: never[] = [];
const EMPTY_HALL_HINT = 'Bàn thờ đang chờ dữ liệu tiền nhân';

// CHỈ dùng cho chế độ minh họa khi chạy dev (?demo=1). Hàm này chỉ được gọi trong nhánh import.meta.env.DEV
// nên bị loại hoàn toàn khỏi bản build production.
const buildDemoAncestors = (): AncestorRecord[] => {
  const tones = ['indigo', 'teal', 'amber', 'rose'] as const;
  const make = (
    id: string, name: string, initials: string, title: string,
    generation: number, birthYear: string, deathYear: string, memorialDate: string
  ): AncestorRecord => ({
    id,
    name,
    initials,
    title,
    generation,
    branch: 'Trực hệ',
    relationship: generation === 1 ? 'Thủy tổ dòng họ' : `Tiền nhân đời thứ ${generation}`,
    birthYear,
    deathYear,
    lifespan: `Sinh ${birthYear} · Mất ${deathYear}`,
    memorialDate,
    memorialPlace: 'Từ đường dòng tộc',
    restingPlace: 'Khu lăng mộ gia tộc',
    biography: 'Dữ liệu minh họa, không phải hồ sơ thật.',
    legacy: 'Đức trọng lưu quang · Gia phong trường tồn',
    portraitTone: tones[generation % 4],
    incenseCount: 0,
  });
  return [
    make('demo-1', 'Cụ Dương Văn Tổ', 'DT', 'Cụ Khởi Tổ', 1, '1868', '1941', 'Ngày 12-03'),
    make('demo-2', 'Cụ bà Nguyễn Thị Cả', 'NC', 'Cụ Bà Khởi Tổ', 1, '1872', '1950', 'Ngày 05-08'),
    make('demo-3', 'Dương Văn Hòa', 'DH', 'Tiền nhân đời thứ 2', 2, '1895', '1968', 'Ngày 21-10'),
    make('demo-4', 'Đỗ Thị Ngọc', 'ĐN', 'Tiền nhân đời thứ 2', 2, '1900', '1975', 'Ngày 02-01'),
    make('demo-5', 'Dương Anh Tuấn', 'DT', 'Tiền nhân đời thứ 3', 3, '1925', '1999', 'Ngày 17-06'),
    make('demo-6', 'Lê Thị Mai', 'LM', 'Tiền nhân đời thứ 3', 3, '1930', '2004', 'Ngày 09-11'),
  ];
};

type IncenseType = 'Hương trầm' | 'Hương sen' | 'Hương quế';

interface LastOffering {
  ancestorId: string;
  incenseType: IncenseType;
  note: string;
}

const INCENSE_OPTIONS: Array<{ id: IncenseType; description: string }> = [
  { id: 'Hương trầm', description: 'Hương thơm trầm ấm, trang nghiêm' },
  { id: 'Hương sen', description: 'Thanh khiết, nhẹ nhàng và an tịnh' },
  { id: 'Hương quế', description: 'Ấm áp, thể hiện lòng thành kính' },
];

const mediaIcon = (type: string) => {
  if (type === 'Ảnh 360°') return '360°';
  if (type === 'Video') return '▶';
  if (type === 'Âm thanh') return '♪';
  if (type === 'Tài liệu') return '▤';
  return '▧';
};

const PortraitPlaceholder: React.FC<{ ancestor: AncestorRecord; compact?: boolean }> = ({ ancestor, compact = false }) => (
  <div
    className={`ancestor-portrait ancestor-portrait-${ancestor.portraitTone} ${compact ? 'ancestor-portrait-compact' : ''}`}
    role="img"
    aria-label={`Ảnh chân dung lưu trữ của ${ancestor.name}`}
  >
    <div className="ancestor-portrait-halo" aria-hidden="true" />
    <div className="ancestor-portrait-silhouette" aria-hidden="true">
      <span className="ancestor-portrait-head" />
      <span className="ancestor-portrait-shoulders" />
    </div>
    <span className="ancestor-portrait-initials">{ancestor.initials}</span>
    {!compact && <small>Ảnh chân dung lưu trữ</small>}
  </div>
);

export const DigitalAncestralHallModule: React.FC = () => {
  const { account } = useAuth();
  const { activeClanId, activeClanName } = useClanContext();
  // Chế độ minh họa: chỉ tồn tại khi chạy dev; ở production điều kiện này luôn là false.
  const [isDemo] = useState<boolean>(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1'
  );
  const [ancestors, setAncestors] = useState<AncestorRecord[]>([]);
  const [loadingAncestors, setLoadingAncestors] = useState(true);

  useEffect(() => {
    if (import.meta.env.DEV && isDemo) {
      setAncestors(buildDemoAncestors());
      setLoadingAncestors(false);
      return;
    }
    if (!activeClanId) {
      setAncestors([]);
      setLoadingAncestors(false);
      return;
    }
    setLoadingAncestors(true);
    fetchFamilyPersons(activeClanId)
      .then((persons) => {
        const deceased = (Array.isArray(persons) ? persons : []).filter(
          (p) => !p.isLiving || p.deathDate
        );
        const mapped: AncestorRecord[] = deceased.map((p) => {
          const parts = p.fullName.trim().split(/\s+/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : p.fullName.slice(0, 2).toUpperCase();
          const birthYear = p.birthDate ? p.birthDate.slice(0, 4) : '—';
          const deathYear = p.deathDate ? p.deathDate.slice(0, 4) : '—';
          const gen = p.generation || 1;

          return {
            id: p.id,
            name: p.fullName,
            initials,
            title: gen === 1 ? 'Cụ Khởi Tổ' : `Tiền nhân đời thứ ${gen}`,
            generation: gen,
            branch: p.branchId || 'Trực hệ',
            relationship: gen === 1 ? 'Thủy tổ dòng họ' : `Tiền nhân đời thứ ${gen}`,
            birthYear,
            deathYear,
            lifespan: p.birthDate && p.deathDate ? `Sinh ${birthYear} · Mất ${deathYear}` : 'Đã khuất',
            memorialDate: p.deathDate ? `Ngày ${p.deathDate}` : 'Chưa cập nhật ngày giỗ',
            memorialPlace: `Từ đường ${activeClanName || 'dòng tộc'}`,
            restingPlace: 'Khu lăng mộ gia tộc',
            biography: `Hồ sơ tiền nhân thuộc ${activeClanName || 'dòng tộc'}.`,
            legacy: 'Đức trọng lưu quang · Gia phong trường tồn',
            portraitTone: (['indigo', 'teal', 'amber', 'rose'] as const)[gen % 4],
            incenseCount: 0,
          };
        });
        setAncestors(mapped);
      })
      .catch(() => setAncestors([]))
      .finally(() => setLoadingAncestors(false));
  }, [activeClanId, activeClanName, isDemo]);

  const [selectedAncestorIndex, setSelectedAncestorIndex] = useState(0);
  const [incenseCounts, setIncenseCounts] = useLocalPreviewState<Record<string, number>>('incense-counts', {});
  const [burningAncestorId, setBurningAncestorId] = useState<string | null>(null);
  const [lastOffering, setLastOffering] = useState<LastOffering | null>(null);
  const [toast, setToast] = useState('');

  const [isIncenseModalOpen, setIsIncenseModalOpen] = useState(false);
  const [incenseType, setIncenseType] = useState<IncenseType>('Hương trầm');
  const [incenseNote, setIncenseNote] = useState('');

  const [messages, setMessages] = useLocalPreviewState<MemorialMessageRecord[]>('worship-messages', []);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageTargetId, setMessageTargetId] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<MemorialMessageRecord | null>(null);

  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

  const [prefer3D, setPrefer3D] = useState(true);
  const [webglOk] = useState<boolean>(detectWebGL);
  const [hall3DFailed, setHall3DFailed] = useState(false);
  const show3D = prefer3D && webglOk && !hall3DFailed;

  const burnTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (ancestors.length > 0 && (!messageTargetId || !ancestors.some((a) => a.id === messageTargetId))) {
      setMessageTargetId(ancestors[0].id);
    }
  }, [ancestors, messageTargetId]);

  // Đổi dòng họ làm danh sách ngắn lại: đưa vị trí chọn về đầu để không bị coi nhầm là bàn thờ trống.
  useEffect(() => {
    if (ancestors.length > 0 && selectedAncestorIndex >= ancestors.length) setSelectedAncestorIndex(0);
  }, [ancestors, selectedAncestorIndex]);

  const selectedAncestor = ancestors[selectedAncestorIndex] || null;
  const selectedMessages = useMemo(
    () => (selectedAncestor ? messages.filter((message) => message.ancestorId === selectedAncestor.id) : []),
    [messages, selectedAncestor]
  );
  const selectedMedia = useMemo(
    () => (selectedAncestor ? ANCESTRAL_MEDIA.filter((item) => item.ancestorId === selectedAncestor.id) : []),
    [selectedAncestor]
  );
  const isSelectedAncestorBurning = selectedAncestor ? burningAncestorId === selectedAncestor.id : false;
  const ancestors3D = useMemo(
    () => ancestors.map((a) => ({ id: a.id, name: a.name, generation: a.generation, lifespan: a.lifespan })),
    [ancestors]
  );

  useEffect(() => {
    return () => {
      if (burnTimerRef.current !== null) window.clearTimeout(burnTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  };

  const selectAncestor = (index: number) => {
    if (ancestors.length === 0) return;
    const normalizedIndex = (index + ancestors.length) % ancestors.length;
    setSelectedAncestorIndex(normalizedIndex);
  };

  const openIncenseModal = () => {
    setIncenseType('Hương trầm');
    setIncenseNote('');
    setIsIncenseModalOpen(true);
  };

  const confirmIncenseOffering = () => {
    const ancestor = selectedAncestor;
    const offering: LastOffering = {
      ancestorId: ancestor.id,
      incenseType,
      note: incenseNote.trim(),
    };

    setIsIncenseModalOpen(false);
    setBurningAncestorId(ancestor.id);
    setLastOffering(offering);

    if (burnTimerRef.current !== null) window.clearTimeout(burnTimerRef.current);
    burnTimerRef.current = window.setTimeout(() => {
      setIncenseCounts((current) => ({
        ...current,
        [ancestor.id]: (current[ancestor.id] || 0) + 1,
      }));
      setBurningAncestorId(null);
      showToast(`Đã dâng ${incenseType.toLocaleLowerCase('vi-VN')} tưởng niệm ${ancestor.name}.`);
    }, 1600);
  };

  const openCreateMessage = () => {
    setEditingMessageId(null);
    setMessageTargetId(selectedAncestor.id);
    setMessageContent('');
    setIsMessageModalOpen(true);
  };

  const openEditMessage = (message: MemorialMessageRecord) => {
    setEditingMessageId(message.id);
    setMessageTargetId(message.ancestorId);
    setMessageContent(message.message);
    setIsMessageModalOpen(true);
  };

  const saveMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanMessage = messageContent.trim();
    if (!cleanMessage) return;

    if (editingMessageId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessageId
            ? { ...message, ancestorId: messageTargetId, message: cleanMessage, createdAt: 'Vừa chỉnh sửa' }
            : message
        )
      );
      showToast('Đã cập nhật lời tưởng niệm của bạn.');
    } else {
      const senderName = account?.display_name || 'Thành viên dòng họ';
      const senderInitials = senderName.split(' ').map((s) => s[0]).slice(-2).join('').toUpperCase() || 'TV';
      const newMessage: MemorialMessageRecord = {
        id: `message-${Date.now()}`,
        ancestorId: messageTargetId,
        sender: senderName,
        initials: senderInitials,
        relationship: 'Thành viên gia tộc',
        message: cleanMessage,
        createdAt: 'Vừa xong',
        isOwn: true,
      };
      setMessages((current) => [newMessage, ...current]);
      showToast('Lời tưởng niệm đã được lưu trong không gian gia tộc.');
    }

    setIsMessageModalOpen(false);
    setEditingMessageId(null);
    setMessageContent('');

    const targetIndex = ancestors.findIndex((ancestor) => ancestor.id === messageTargetId);
    if (targetIndex >= 0) setSelectedAncestorIndex(targetIndex);
  };

  const confirmDeleteMessage = () => {
    if (!pendingDeleteMessage) return;
    setMessages((current) => current.filter((message) => message.id !== pendingDeleteMessage.id));
    setPendingDeleteMessage(null);
    showToast('Đã xóa lời tưởng niệm của bạn.');
  };

  const openAncestralMedia = () => {
    if (!selectedAncestor) return;
    setIsMediaModalOpen(true);
  };

  if (loadingAncestors) {
    return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu tiền nhân dòng họ...</div>;
  }

  if (ancestors.length === 0 || !selectedAncestor) {
    // Chưa có tiền nhân: vẫn hiển thị bàn thờ 3D trống (các ô bài vị mờ) nếu thiết bị hỗ trợ.
    if (show3D) {
      return (
        <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
          <header className="ancestral-hall-header">
            <div>
              <span className="ancestral-hall-eyebrow">KHÔNG GIAN TƯỞNG NIỆM GIA TỘC</span>
              <h1 id="ancestral-hall-title">Phòng Thờ Số · {activeClanName || 'Dòng Họ'}</h1>
              <p>Thành kính tưởng nhớ tiền nhân, gìn giữ ký ức và kết nối lòng tri ân của con cháu.</p>
            </div>
          </header>
          <div className="hall3d-section">
            <React.Suspense fallback={<div className="hall3d-loading" role="status"><span className="hall3d-loading-flame" aria-hidden="true" /><span>Đang thắp đèn…</span></div>}>
              <AncestralHall3D
                ancestors={NO_ANCESTORS}
                selectedIndex={-1}
                onSelect={selectAncestor}
                emptyHint={EMPTY_HALL_HINT}
                hallTitle={activeClanName || undefined}
                onError={() => setHall3DFailed(true)}
              />
            </React.Suspense>
          </div>
          <div className="hall3d-empty-note" role="status">
            <strong>Chưa có thông tin tiền nhân đã khuất.</strong> Khi dữ liệu gia phả được cập nhật (thành viên có trạng thái đã mất hoặc ngày mất), bài vị sẽ tự động hiển thị trên bàn thờ.
          </div>
        </section>
      );
    }
    return (
      <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
        <header className="ancestral-hall-header">
          <div>
            <span className="ancestral-hall-eyebrow">KHÔNG GIAN TƯỞNG NIỆM GIA TỘC</span>
            <h1 id="ancestral-hall-title">Phòng Thờ Số · {activeClanName || 'Dòng Họ'}</h1>
            <p>Thành kính tưởng nhớ tiền nhân, gìn giữ ký ức và kết nối lòng tri ân của con cháu.</p>
          </div>
        </header>
        <div style={{ padding: '60px 24px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', margin: '24px 0' }}>
          <div style={{ marginBottom: '16px' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 2 2 3.5 2 5a2 2 0 1 1-4 0c0-1.5 1-3 2-5zM9 11h6v11H9z" /></svg></div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Chưa có thông tin Tiền nhân đã khuất</h3>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '560px', margin: '0 auto' }}>
            Không gian Phòng Thờ Số kết nối trực tiếp với các vị tiền nhân đã khuất trong cơ sở dữ liệu gia phả của {activeClanName || 'dòng họ'}.
            Hãy cập nhật trạng thái đã mất hoặc ngày mất cho thành viên trong Cây Gia Phả để đưa vào tưởng niệm.
          </p>
        </div>
      </section>
    );
  }

  const altar3D = (
    <div className="hall3d-section">
      <React.Suspense fallback={<div className="hall3d-loading" role="status"><span className="hall3d-loading-flame" aria-hidden="true" /><span>Đang thắp đèn…</span></div>}>
        <AncestralHall3D
          ancestors={ancestors3D}
          selectedIndex={selectedAncestorIndex}
          onSelect={selectAncestor}
          incenseCount={incenseCounts[selectedAncestor.id] || 0}
          isBurning={isSelectedAncestorBurning}
          hallTitle={activeClanName || undefined}
          onError={() => setHall3DFailed(true)}
        />
      </React.Suspense>

      <div className="hall3d-caption" aria-live="polite">
        <strong>{selectedAncestor.name}</strong>
        <span>{selectedAncestor.title} · Đời thứ {selectedAncestor.generation}</span>
        <small>{selectedAncestor.birthYear} – {selectedAncestor.deathYear}</small>
        <small>
          {isSelectedAncestorBurning
            ? 'Tâm hương đang được dâng lên…'
            : `${incenseCounts[selectedAncestor.id] || 0} nén tâm hương`}
        </small>
      </div>

      <div className="digital-altar-actions">
        <button
          type="button"
          className="light-incense-button"
          onClick={openIncenseModal}
          disabled={isSelectedAncestorBurning}
        >
          <span aria-hidden="true">✦</span>
          {isSelectedAncestorBurning ? 'Đang dâng tâm hương…' : 'Thắp hương tưởng niệm'}
        </button>
        <button type="button" className="write-memorial-button" onClick={openCreateMessage}>
          Viết lời tưởng niệm
        </button>
      </div>
    </div>
  );

  const altar2D = (
    <article className="digital-altar-card" aria-labelledby="digital-altar-title">
      <div className="digital-altar-glow" aria-hidden="true" />
      <div className="altar-lantern altar-lantern-left" aria-hidden="true"><span /></div>
      <div className="altar-lantern altar-lantern-right" aria-hidden="true"><span /></div>

      <div className="digital-altar-content">
        <span className="digital-altar-kicker">TỪ ĐƯỜNG {activeClanName ? activeClanName.toUpperCase() : 'GIA TỘC'}</span>
        <h2 id="digital-altar-title">Bài Vị Tiền Nhân</h2>

        <div className="digital-altar-tablet" aria-label={`Bài vị của ${selectedAncestor.name}`}>
          <span className="digital-altar-crest">福</span>
          <strong>{selectedAncestor.name.toLocaleUpperCase('vi-VN')}</strong>
          <small>{selectedAncestor.title} · {selectedAncestor.birthYear}—{selectedAncestor.deathYear}</small>
        </div>

        <div className="altar-offerings" aria-label="Lễ vật tưởng niệm số">
          <div className="altar-offering altar-offering-flower"><span aria-hidden="true">❀</span><small>Hoa sen</small></div>
          <div className="altar-offering altar-offering-fruit"><span aria-hidden="true">● ● ●</span><small>Mâm ngũ quả</small></div>
          <div className="altar-offering altar-offering-light"><span aria-hidden="true">✦</span><small>Nến tâm đăng</small></div>
        </div>

        <div className={`digital-incense-burner ${isSelectedAncestorBurning ? 'is-burning' : ''}`} aria-live="polite">
          <div className="incense-smoke" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="incense-sticks" aria-hidden="true"><i /><i /><i /></div>
          <div className="incense-pot" aria-hidden="true"><span>THỌ</span></div>
          <strong>{incenseCounts[selectedAncestor.id] || 0} nén tâm hương</strong>
          <small>{isSelectedAncestorBurning ? 'Tâm hương đang được dâng lên…' : 'Được con cháu thành kính dâng tưởng niệm'}</small>
        </div>

        {lastOffering?.ancestorId === selectedAncestor.id && (
          <div className="latest-offering-note">
            <span>Lời nguyện gần nhất · {lastOffering.incenseType}</span>
            {lastOffering.note && <p>“{lastOffering.note}”</p>}
          </div>
        )}

        <div className="digital-altar-actions">
          <button
            type="button"
            className="light-incense-button"
            onClick={openIncenseModal}
            disabled={isSelectedAncestorBurning}
          >
            <span aria-hidden="true">✦</span>
            {isSelectedAncestorBurning ? 'Đang dâng tâm hương…' : 'Thắp hương tưởng niệm'}
          </button>
          <button type="button" className="write-memorial-button" onClick={openCreateMessage}>
            Viết lời tưởng niệm
          </button>
        </div>
      </div>
    </article>
  );

  return (
    <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
      {import.meta.env.DEV && isDemo && (
        <div className="hall3d-demo-banner" role="note">Chế độ minh họa (dữ liệu giả, không lưu vào hệ thống)</div>
      )}
      <header className="ancestral-hall-header">
        <div>
          <span className="ancestral-hall-eyebrow">KHÔNG GIAN TƯỞNG NIỆM GIA TỘC</span>
          <h1 id="ancestral-hall-title">Phòng Thờ Số</h1>
          <p>Thành kính tưởng nhớ tiền nhân, gìn giữ ký ức và kết nối lòng tri ân của con cháu.</p>
        </div>
        <div className="ancestral-hall-position" aria-label="Vị trí trong danh sách tổ tiên">
          <strong>{String(selectedAncestorIndex + 1).padStart(2, '0')}</strong>
          <span>/ {String(ancestors.length).padStart(2, '0')}</span>
        </div>
      </header>

      <article className="ancestor-focus-card">
        <button
          type="button"
          className="ancestor-nav-button ancestor-nav-previous"
          onClick={() => selectAncestor(selectedAncestorIndex - 1)}
          aria-label="Xem vị tiền nhân trước"
        >
          ‹
        </button>

        <div className="ancestor-focus-portrait">
          <PortraitPlaceholder ancestor={selectedAncestor} />
        </div>

        <div className="ancestor-focus-copy">
          <span className="ancestor-honorific">{selectedAncestor.title} · Đời thứ {selectedAncestor.generation}</span>
          <h2>{selectedAncestor.name}</h2>
          <p className="ancestor-branch">{selectedAncestor.branch}</p>

          <dl className="ancestor-vitals-grid">
            <div>
              <dt>Sinh – Mất</dt>
              <dd>{selectedAncestor.birthYear} – {selectedAncestor.deathYear}</dd>
            </div>
            <div>
              <dt>Hưởng thọ</dt>
              <dd>{selectedAncestor.lifespan.replace('Hưởng thọ ', '')}</dd>
            </div>
            <div>
              <dt>Ngày tưởng niệm</dt>
              <dd>{selectedAncestor.memorialDate}</dd>
            </div>
            <div>
              <dt>Địa điểm</dt>
              <dd>{selectedAncestor.memorialPlace}</dd>
            </div>
          </dl>

          <div className="ancestor-focus-actions">
            <button type="button" className="ancestral-secondary-button" onClick={() => setIsInfoModalOpen(true)}>
              Xem thông tin
            </button>
            <button type="button" className="ancestral-secondary-button" onClick={openAncestralMedia}>
              Mở tư liệu tổ tiên <span>{selectedMedia.length}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="ancestor-nav-button ancestor-nav-next"
          onClick={() => selectAncestor(selectedAncestorIndex + 1)}
          aria-label="Xem vị tiền nhân tiếp theo"
        >
          ›
        </button>
      </article>

      <div className="ancestor-selector" role="tablist" aria-label="Chọn vị tiền nhân">
        {ancestors.map((ancestor, index) => (
          <button
            key={ancestor.id}
            type="button"
            role="tab"
            aria-selected={index === selectedAncestorIndex}
            className={index === selectedAncestorIndex ? 'active' : ''}
            onClick={() => selectAncestor(index)}
          >
            <PortraitPlaceholder ancestor={ancestor} compact />
            <span>
              <strong>{ancestor.name}</strong>
              <small>{ancestor.title} · Đời {ancestor.generation}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="hall3d-mode-bar">
        <div className="hall3d-mode-toggle" role="group" aria-label="Chế độ hiển thị bàn thờ">
          <button
            type="button"
            className={show3D ? 'active' : ''}
            aria-pressed={show3D}
            disabled={!webglOk || hall3DFailed}
            onClick={() => setPrefer3D(true)}
          >
            Phòng thờ 3D
          </button>
          <button
            type="button"
            className={!show3D ? 'active' : ''}
            aria-pressed={!show3D}
            onClick={() => setPrefer3D(false)}
          >
            Bàn thờ 2D
          </button>
        </div>
        {(!webglOk || hall3DFailed) && (
          <small className="hall3d-mode-note">Thiết bị không hỗ trợ 3D, đang hiển thị bàn thờ 2D.</small>
        )}
      </div>

      {show3D ? altar3D : altar2D}

      <section className="memorial-messages-section" aria-labelledby="memorial-messages-title">
        <div className="memorial-section-header">
          <div>
            <span>LƯU BÚT GIA TỘC</span>
            <h2 id="memorial-messages-title">Lời Tưởng Niệm</h2>
            <p>Dành cho {selectedAncestor.name} · {selectedAncestor.title}</p>
          </div>
          <button type="button" className="ancestral-primary-button" onClick={openCreateMessage}>
            + Viết lời tưởng niệm
          </button>
        </div>

        {selectedMessages.length === 0 ? (
          <div className="memorial-empty-state">
            <div aria-hidden="true">✦</div>
            <h3>Chưa có lời tưởng niệm</h3>
            <p>Hãy là người đầu tiên lưu lại một lời tri ân dành cho {selectedAncestor.name}.</p>
            <button type="button" onClick={openCreateMessage}>Viết lời đầu tiên</button>
          </div>
        ) : (
          <div className="memorial-message-list">
            {selectedMessages.map((message) => (
              <article key={message.id} className="memorial-message-card">
                <div className="memorial-message-avatar" aria-hidden="true">{message.initials}</div>
                <div className="memorial-message-content">
                  <header>
                    <div>
                      <strong>{message.sender}</strong>
                      {message.isOwn && <span className="own-message-badge">Lời của bạn</span>}
                      <small>{message.relationship}</small>
                    </div>
                    <time>{message.createdAt}</time>
                  </header>
                  <p>“{message.message}”</p>
                  {message.isOwn && (
                    <div className="memorial-message-actions">
                      <button type="button" onClick={() => openEditMessage(message)}>Chỉnh sửa</button>
                      <button type="button" className="danger" onClick={() => setPendingDeleteMessage(message)}>Xóa</button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {toast && <div className="ancestral-toast" role="status" aria-live="polite"><span>✓</span>{toast}</div>}

      {isIncenseModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsIncenseModalOpen(false)}>
          <div
            className="ancestral-modal ancestral-incense-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="incense-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>DÂNG TÂM HƯƠNG</span>
                <h2 id="incense-modal-title">Thắp hương tưởng niệm</h2>
                <p>Kính dâng {selectedAncestor.title} {selectedAncestor.name}</p>
              </div>
              <button type="button" onClick={() => setIsIncenseModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>

            <fieldset className="incense-type-options">
              <legend>Chọn loại hương</legend>
              {INCENSE_OPTIONS.map((option) => (
                <label key={option.id} className={incenseType === option.id ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="incense-type"
                    value={option.id}
                    checked={incenseType === option.id}
                    onChange={() => setIncenseType(option.id)}
                  />
                  <span className="incense-choice-mark" aria-hidden="true" />
                  <span><strong>{option.id}</strong><small>{option.description}</small></span>
                </label>
              ))}
            </fieldset>

            <label className="ancestral-form-field">
              <span>Lời nguyện hoặc ghi chú <small>(không bắt buộc)</small></span>
              <textarea
                rows={4}
                maxLength={240}
                value={incenseNote}
                onChange={(event) => setIncenseNote(event.target.value)}
                placeholder="Gửi lời cầu nguyện bình an, tưởng nhớ công đức tiền nhân…"
              />
              <small>{incenseNote.length}/240 ký tự</small>
            </label>

            <div className="ancestral-modal-note">Tâm hương chỉ được lưu trong phiên trình diễn này và không phát sinh giao dịch.</div>
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setIsIncenseModalOpen(false)}>Hủy</button>
              <button type="button" className="ancestral-confirm-button" onClick={confirmIncenseOffering}>Xác nhận dâng hương</button>
            </div>
          </div>
        </div>
      )}

      {isMessageModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsMessageModalOpen(false)}>
          <div
            className="ancestral-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>LƯU BÚT TƯỞNG NIỆM</span>
                <h2 id="message-modal-title">{editingMessageId ? 'Chỉnh sửa lời tưởng niệm' : 'Viết lời tưởng niệm'}</h2>
                <p>Những lời trang trọng sẽ được lưu cùng ký ức gia tộc.</p>
              </div>
              <button type="button" onClick={() => setIsMessageModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>

            <form onSubmit={saveMessage}>
              <label className="ancestral-form-field">
                <span>Kính gửi vị tiền nhân <b>*</b></span>
                <select value={messageTargetId} onChange={(event) => setMessageTargetId(event.target.value)}>
                  {ancestors.map((ancestor) => (
                    <option key={ancestor.id} value={ancestor.id}>{ancestor.title} {ancestor.name} · Đời {ancestor.generation}</option>
                  ))}
                </select>
              </label>
              <label className="ancestral-form-field">
                <span>Nội dung lời tưởng niệm <b>*</b></span>
                <textarea
                  autoFocus
                  required
                  rows={6}
                  minLength={5}
                  maxLength={500}
                  value={messageContent}
                  onChange={(event) => setMessageContent(event.target.value)}
                  placeholder="Viết lời tri ân và những điều bạn muốn lưu lại…"
                />
                <small>{messageContent.length}/500 ký tự</small>
              </label>
              <div className="ancestral-modal-note">Vui lòng sử dụng ngôn từ trang trọng, phù hợp với không gian tưởng niệm chung.</div>
              <div className="ancestral-modal-actions">
                <button type="button" className="ancestral-cancel-button" onClick={() => setIsMessageModalOpen(false)}>Hủy</button>
                <button type="submit" className="ancestral-confirm-button" disabled={messageContent.trim().length < 5}>
                  {editingMessageId ? 'Lưu thay đổi' : 'Gửi lời tưởng niệm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteMessage && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setPendingDeleteMessage(null)}>
          <div
            className="ancestral-modal ancestral-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-confirm-icon" aria-hidden="true">!</div>
            <h2 id="delete-message-title">Xóa lời tưởng niệm?</h2>
            <p>Lời tưởng niệm này sẽ bị gỡ khỏi không gian gia tộc trong phiên trình diễn.</p>
            <blockquote>“{pendingDeleteMessage.message}”</blockquote>
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setPendingDeleteMessage(null)}>Giữ lại</button>
              <button type="button" className="ancestral-delete-button" onClick={confirmDeleteMessage}>Xác nhận xóa</button>
            </div>
          </div>
        </div>
      )}

      {isInfoModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsInfoModalOpen(false)}>
          <div
            className="ancestral-modal ancestor-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ancestor-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>HỒ SƠ TIỀN NHÂN</span>
                <h2 id="ancestor-info-title">{selectedAncestor.name}</h2>
                <p>{selectedAncestor.title} · {selectedAncestor.relationship}</p>
              </div>
              <button type="button" onClick={() => setIsInfoModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>
            <div className="ancestor-info-profile">
              <PortraitPlaceholder ancestor={selectedAncestor} compact />
              <dl>
                <div><dt>Niên đại</dt><dd>{selectedAncestor.birthYear} – {selectedAncestor.deathYear}</dd></div>
                <div><dt>Chi / Nhánh</dt><dd>{selectedAncestor.branch}</dd></div>
                <div><dt>Ngày tưởng niệm</dt><dd>{selectedAncestor.memorialDate}</dd></div>
                <div><dt>An nghỉ</dt><dd>{selectedAncestor.restingPlace}</dd></div>
              </dl>
            </div>
            <div className="ancestor-biography-copy">
              <h3>Tiểu sử lưu truyền</h3>
              <p>{selectedAncestor.biography}</p>
              <blockquote>{selectedAncestor.legacy}</blockquote>
            </div>
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setIsInfoModalOpen(false)}>Đóng</button>
              <button type="button" className="ancestral-confirm-button" onClick={() => { setIsInfoModalOpen(false); openAncestralMedia(); }}>Xem tư liệu liên quan</button>
            </div>
          </div>
        </div>
      )}

      {isMediaModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsMediaModalOpen(false)}>
          <div
            className="ancestral-modal ancestor-media-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ancestor-media-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>THƯ VIỆN TỔ TIÊN</span>
                <h2 id="ancestor-media-title">Tư liệu về {selectedAncestor.name}</h2>
                <p>{selectedMedia.length} tư liệu đã được số hóa trong thư viện.</p>
              </div>
              <button type="button" onClick={() => setIsMediaModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>
            {selectedMedia.length === 0 ? (
              <div className="memorial-empty-state compact"><h3>Chưa có tư liệu</h3><p>Tư liệu về vị tiền nhân này đang được sưu tầm.</p></div>
            ) : (
              <div className="ancestor-media-preview-list">
                {selectedMedia.map((item) => (
                  <article key={item.id}>
                    <div className={`ancestor-media-icon media-accent-${item.accent}`} aria-hidden="true">{mediaIcon(item.type)}</div>
                    <div><span>{item.type}</span><h3>{item.title}</h3><p>{item.description}</p><small>{item.capturedAt} · {item.source}</small></div>
                  </article>
                ))}
              </div>
            )}
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setIsMediaModalOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default DigitalAncestralHallModule;
