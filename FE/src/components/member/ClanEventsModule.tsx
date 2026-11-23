import React, { useEffect, useMemo, useState } from 'react';
import {
  ConfirmDialog,
  FeatureEmptyState,
  FeatureIcon,
  FeatureModal,
  FeaturePagination,
  FeatureToast,
} from '../common/FeatureUI';
import {
  type EventParticipant,
  type EventStatus,
  type FamilyEventRecord,
  type MemorialRecord,
} from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import './ClanEventsModule.css';

// ===== DEFAULT DATA SEED =====
const DEFAULT_EVENTS: FamilyEventRecord[] = [
  {
    id: 'SK-001',
    name: 'Đại hội Dòng họ & Tế Tổ Thường Niên 2026',
    type: 'ceremony',
    description: 'Nghi lễ tế tổ đầu năm và họp mặt toàn thể bà con nội ngoại trên khắp cả nước.',
    startDate: '15/03/2026',
    endDate: '16/03/2026',
    time: '07:30 – 16:30',
    location: 'Nhà thờ họ Tổ, Thôn An Thái, Xã Kim Liên, Nam Đàn, Nghệ An',
    organizer: 'Hội đồng Gia tộc & Ban Khánh tiết',
    status: 'upcoming',
    notes: 'Trang phục trang trọng, con cháu các chi nhánh cử đại diện về dâng lễ.',
    participants: [
      { id: 'TV-001', name: 'Nguyễn Văn Minh', initial: 'M', relationship: 'Trưởng chi 1', rsvp: 'confirmed' },
      { id: 'TV-002', name: 'Nguyễn Thị Hoa', initial: 'H', relationship: 'Dâu chi 2', rsvp: 'confirmed' },
      { id: 'TV-003', name: 'Nguyễn Văn Tuấn', initial: 'T', relationship: 'Thành viên đời 4', rsvp: 'pending' },
    ],
  },
  {
    id: 'SK-002',
    name: 'Lễ Trao Quỹ Khuyến Học & Tuyên Dương Con Cháu Đỗ Đạt',
    type: 'scholarship',
    description: 'Khen thưởng các cháu đạt thành tích cao trong kỳ thi học sinh giỏi và đỗ đại học.',
    startDate: '20/08/2026',
    endDate: '20/08/2026',
    time: '08:30 – 11:30',
    location: 'Hội trường Từ đường Dòng họ',
    organizer: 'Ban Khuyến học Dòng họ',
    status: 'upcoming',
    notes: 'Mời phụ huynh và các em học sinh có danh sách khen thưởng tham dự.',
    participants: [
      { id: 'TV-004', name: 'Nguyễn Văn Quang', initial: 'Q', relationship: 'Trưởng ban Khuyến học', rsvp: 'confirmed' },
      { id: 'TV-005', name: 'Nguyễn Hoàng Nam', initial: 'N', relationship: 'Thành viên đời 5', rsvp: 'confirmed' },
    ],
  },
  {
    id: 'SK-003',
    name: 'Họp Bàn Kế Hoạch Tu Bổ & Tôn Tạo Khu Lăng Mộ',
    type: 'meeting',
    description: 'Họp đại diện các chi bàn phương án đóng góp và bản vẽ tôn tạo lăng mộ tổ.',
    startDate: '10/05/2026',
    endDate: '10/05/2026',
    time: '09:00 – 11:00',
    location: 'Phòng họp Nhà thờ họ & Trực tuyến Zoom',
    organizer: 'Ban Trị sự Dòng tộc',
    status: 'completed',
    notes: 'Đã thống nhất dự toán và phương án triển khai vào quý 3.',
    participants: [
      { id: 'TV-006', name: 'Nguyễn Văn An', initial: 'A', relationship: 'Chi phó chi 1', rsvp: 'confirmed' },
    ],
  },
];

const DEFAULT_MEMORIALS: MemorialRecord[] = [
  {
    id: 'GT-001',
    name: 'Cụ Nguyễn Văn Tông',
    initial: 'T',
    generation: 1,
    deathDate: '15/08/1945',
    memorialDate: '15/08/2026',
    lunarDate: '15/08 Âm lịch',
    relationship: 'Thủy Tổ Chi Trưởng',
    reminder: true,
    notes: 'Giỗ chính hàng năm tổ chức tại Từ đường chi trưởng, con cháu tề tựu đông đủ.',
  },
  {
    id: 'GT-002',
    name: 'Bà Lê Thị Mai',
    initial: 'M',
    generation: 1,
    deathDate: '20/10/1952',
    memorialDate: '20/10/2026',
    lunarDate: '02/09 Âm lịch',
    relationship: 'Chính Thất Thủy Tổ',
    reminder: true,
    notes: 'Cúng giỗ tại gian thờ bà, con cháu chuẩn bị mâm cúng truyền thống.',
  },
  {
    id: 'GT-003',
    name: 'Cụ Nguyễn Văn Phúc',
    initial: 'P',
    generation: 2,
    deathDate: '05/03/1980',
    memorialDate: '05/03/2026',
    lunarDate: '18/01 Âm lịch',
    relationship: 'Tiền nhân đời 2',
    reminder: false,
    notes: 'Tổ chức cúng tại nhà riêng trưởng nhánh 2.',
  },
  {
    id: 'GT-004',
    name: 'Cụ Nguyễn Văn Đức',
    initial: 'Đ',
    generation: 3,
    deathDate: '12/12/2005',
    memorialDate: '12/12/2026',
    lunarDate: '12/11 Âm lịch',
    relationship: 'Tiền nhân đời 3',
    reminder: true,
    notes: 'Ngày giỗ nhớ chuẩn bị lễ tế và thắp hương tại mộ phần.',
  },
];

type EventForm = Omit<FamilyEventRecord, 'id' | 'participants'>;
const EMPTY_EVENT_FORM: EventForm = {
  name: '',
  type: 'meeting',
  description: '',
  startDate: '',
  endDate: '',
  time: '',
  location: '',
  organizer: '',
  status: 'upcoming',
  notes: '',
};

type MemorialForm = Omit<MemorialRecord, 'id'>;
const EMPTY_MEMORIAL_FORM: MemorialForm = {
  name: '',
  initial: '',
  generation: 1,
  deathDate: '',
  memorialDate: '',
  lunarDate: '',
  relationship: '',
  reminder: true,
  notes: '',
};

const statusLabels: Record<EventStatus, string> = {
  upcoming: 'Sắp diễn ra',
  ongoing: 'Đang diễn ra',
  completed: 'Đã kết thúc',
  cancelled: 'Đã hủy',
};

const typeLabels: Record<string, string> = {
  meeting: 'Họp dòng họ',
  ceremony: 'Nghi lễ tế tổ',
  scholarship: 'Khuyến học',
  trip: 'Về nguồn',
};

const displayDate = (value: string) => (value.includes('-') ? value.split('-').reverse().join('/') : value);
const inputDate = (value: string) => (value.includes('/') ? value.split('/').reverse().join('-') : value);

const parseDateStamp = (value: string) => {
  const parts = value.includes('/') ? value.split('/').reverse() : value.split('-');
  const stamp = new Date(parts.join('-')).getTime();
  return Number.isNaN(stamp) ? Number.MAX_SAFE_INTEGER : stamp;
};

export interface ClanEventsModuleProps {
  canManage?: boolean;
  initialTab?: 'events' | 'memorials' | 'timeline';
}

export const ClanEventsModule: React.FC<ClanEventsModuleProps> = ({
  canManage = true,
  initialTab = 'events',
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'memorials' | 'timeline'>(initialTab);

  // Sync tab if initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Data persistence via localStorage
  const [events, setEvents] = useLocalPreviewState<FamilyEventRecord[]>('events', DEFAULT_EVENTS);
  const [memorials, setMemorials] = useLocalPreviewState<MemorialRecord[]>('memorials', DEFAULT_MEMORIALS);

  // Event State
  const [eventSearch, setEventSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | FamilyEventRecord['type']>('all');
  const [eventStatusFilter, setEventStatusFilter] = useState<'all' | EventStatus>('all');
  const [eventPage, setEventPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<FamilyEventRecord | null>(null);
  const [editingEvent, setEditingEvent] = useState<FamilyEventRecord | 'new' | null>(null);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_EVENT_FORM);
  const [eventErrors, setEventErrors] = useState<Record<string, string>>({});
  const [deleteEventTarget, setDeleteEventTarget] = useState<FamilyEventRecord | null>(null);
  const [participantName, setParticipantName] = useState('');
  const [participantRelationship, setParticipantRelationship] = useState('');
  const [removeParticipant, setRemoveParticipant] = useState<EventParticipant | null>(null);

  // Memorial State
  const [memorialSearch, setMemorialSearch] = useState('');
  const [reminderFilter, setReminderFilter] = useState<'all' | 'on' | 'off'>('all');
  const [memorialSort, setMemorialSort] = useState<'date' | 'name' | 'generation'>('date');
  const [memorialPage, setMemorialPage] = useState(1);
  const [selectedMemorial, setSelectedMemorial] = useState<MemorialRecord | null>(null);
  const [editingMemorial, setEditingMemorial] = useState<MemorialRecord | 'new' | null>(null);
  const [memorialForm, setMemorialForm] = useState<MemorialForm>(EMPTY_MEMORIAL_FORM);
  const [memorialErrors, setMemorialErrors] = useState<Record<string, string>>({});
  const [deleteMemorialTarget, setDeleteMemorialTarget] = useState<MemorialRecord | null>(null);

  // Timeline State
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'events' | 'memorials'>('all');
  const [timelineSearch, setTimelineSearch] = useState('');

  // General Toast
  const [toast, setToast] = useState('');

  // ===== FILTERED EVENTS =====
  const filteredEvents = useMemo(() => {
    return events.filter((item) => {
      const text = `${item.name} ${item.location} ${item.organizer} ${item.description}`.toLocaleLowerCase('vi');
      const matchesSearch = text.includes(eventSearch.trim().toLocaleLowerCase('vi'));
      const matchesType = eventTypeFilter === 'all' || item.type === eventTypeFilter;
      const matchesStatus = eventStatusFilter === 'all' || item.status === eventStatusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [events, eventSearch, eventTypeFilter, eventStatusFilter]);

  const EVENT_PAGE_SIZE = 6;
  const totalEventPages = Math.max(1, Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE));
  const visibleEvents = filteredEvents.slice((eventPage - 1) * EVENT_PAGE_SIZE, eventPage * EVENT_PAGE_SIZE);

  // ===== FILTERED MEMORIALS =====
  const filteredMemorials = useMemo(() => {
    return memorials
      .filter((item) => {
        const text = `${item.name} ${item.relationship} ${item.notes} ${item.lunarDate}`.toLocaleLowerCase('vi');
        const matchesSearch = text.includes(memorialSearch.trim().toLocaleLowerCase('vi'));
        const matchesReminder =
          reminderFilter === 'all' || (reminderFilter === 'on' ? item.reminder : !item.reminder);
        return matchesSearch && matchesReminder;
      })
      .sort((a, b) => {
        if (memorialSort === 'name') return a.name.localeCompare(b.name, 'vi');
        if (memorialSort === 'generation') return a.generation - b.generation;
        return parseDateStamp(a.memorialDate) - parseDateStamp(b.memorialDate);
      });
  }, [memorials, memorialSearch, reminderFilter, memorialSort]);

  const MEMORIAL_PAGE_SIZE = 6;
  const totalMemorialPages = Math.max(1, Math.ceil(filteredMemorials.length / MEMORIAL_PAGE_SIZE));
  const visibleMemorials = filteredMemorials.slice(
    (memorialPage - 1) * MEMORIAL_PAGE_SIZE,
    memorialPage * MEMORIAL_PAGE_SIZE
  );

  // ===== COMBINED TIMELINE ITEMS =====
  const combinedTimeline = useMemo(() => {
    const list: Array<{
      id: string;
      itemType: 'event' | 'memorial';
      title: string;
      dateStr: string;
      subDate: string;
      desc: string;
      badgeText: string;
      originalEvent?: FamilyEventRecord;
      originalMemorial?: MemorialRecord;
    }> = [];

    if (timelineFilter === 'all' || timelineFilter === 'events') {
      events.forEach((e) => {
        list.push({
          id: e.id,
          itemType: 'event',
          title: e.name,
          dateStr: e.startDate,
          subDate: e.time,
          desc: `${e.location ? e.location + ' • ' : ''}${e.organizer}`,
          badgeText: typeLabels[e.type] || 'Sự kiện',
          originalEvent: e,
        });
      });
    }

    if (timelineFilter === 'all' || timelineFilter === 'memorials') {
      memorials.forEach((m) => {
        list.push({
          id: m.id,
          itemType: 'memorial',
          title: `Giỗ ${m.name}`,
          dateStr: m.memorialDate,
          subDate: m.lunarDate,
          desc: `${m.relationship} • Đời ${m.generation}`,
          badgeText: 'Ngày giỗ',
          originalMemorial: m,
        });
      });
    }

    return list
      .filter((item) => {
        if (!timelineSearch.trim()) return true;
        const text = `${item.title} ${item.desc} ${item.dateStr} ${item.subDate}`.toLocaleLowerCase('vi');
        return text.includes(timelineSearch.trim().toLocaleLowerCase('vi'));
      })
      .sort((a, b) => parseDateStamp(a.dateStr) - parseDateStamp(b.dateStr));
  }, [events, memorials, timelineFilter, timelineSearch]);

  // KPIs Calculations
  const upcomingEventsCount = events.filter((e) => e.status === 'upcoming').length;
  const nearestMemorial = memorials[0] ? `${memorials[0].lunarDate} – ${memorials[0].name}` : 'Chưa có';
  const reminderActiveCount = memorials.filter((m) => m.reminder).length;
  const totalParticipants = events.reduce((sum, item) => sum + item.participants.length, 0);

  // Handlers for Events
  const openEventForm = (item?: FamilyEventRecord) => {
    if (!canManage) return;
    setEditingEvent(item || 'new');
    setEventErrors({});
    setEventForm(
      item
        ? {
            name: item.name,
            type: item.type,
            description: item.description,
            startDate: inputDate(item.startDate),
            endDate: inputDate(item.endDate || item.startDate),
            time: item.time,
            location: item.location,
            organizer: item.organizer,
            status: item.status,
            notes: item.notes,
          }
        : EMPTY_EVENT_FORM
    );
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!eventForm.name.trim()) errors.name = 'Vui lòng nhập tên sự kiện.';
    if (!eventForm.startDate) errors.startDate = 'Vui lòng chọn ngày bắt đầu.';
    if (!eventForm.endDate) errors.endDate = 'Vui lòng chọn ngày kết thúc.';
    if (eventForm.startDate && eventForm.endDate && eventForm.endDate < eventForm.startDate) {
      errors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu.';
    }
    if (!eventForm.time.trim()) errors.time = 'Vui lòng nhập thời gian.';
    if (!eventForm.location.trim()) errors.location = 'Vui lòng nhập địa điểm.';
    if (!eventForm.organizer.trim()) errors.organizer = 'Vui lòng nhập đơn vị tổ chức.';
    setEventErrors(errors);
    if (Object.keys(errors).length) return;

    const existing = editingEvent !== 'new' ? editingEvent : null;
    const record: FamilyEventRecord = {
      ...eventForm,
      id: existing?.id || `SK-${String(Date.now()).slice(-5)}`,
      startDate: displayDate(eventForm.startDate),
      endDate: displayDate(eventForm.endDate),
      participants: existing?.participants || [],
    };

    setEvents((current) =>
      existing ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]
    );
    setSelectedEvent(record);
    setEditingEvent(null);
    setToast(existing ? 'Đã cập nhật sự kiện gia tộc.' : 'Đã tạo sự kiện mới thành công.');
  };

  const addParticipant = () => {
    if (!selectedEvent || !participantName.trim()) return;
    const participant: EventParticipant = {
      id: `TV-${Date.now()}`,
      name: participantName.trim(),
      initial: participantName.trim().charAt(0).toUpperCase(),
      relationship: participantRelationship.trim() || 'Thành viên gia tộc',
      rsvp: 'pending',
    };
    const updated = { ...selectedEvent, participants: [...selectedEvent.participants, participant] };
    setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedEvent(updated);
    setParticipantName('');
    setParticipantRelationship('');
    setToast('Đã thêm người tham dự vào danh sách.');
  };

  const updateRsvp = (participantId: string, rsvp: EventParticipant['rsvp']) => {
    if (!selectedEvent) return;
    const updated = {
      ...selectedEvent,
      participants: selectedEvent.participants.map((item) =>
        item.id === participantId ? { ...item, rsvp } : item
      ),
    };
    setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedEvent(updated);
  };

  const removeSelectedParticipant = () => {
    if (!selectedEvent || !removeParticipant) return;
    const updated = {
      ...selectedEvent,
      participants: selectedEvent.participants.filter((item) => item.id !== removeParticipant.id),
    };
    setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedEvent(updated);
    setRemoveParticipant(null);
    setToast('Đã xóa người tham dự khỏi sự kiện.');
  };

  // Handlers for Memorials
  const openMemorialForm = (item?: MemorialRecord) => {
    if (!canManage) return;
    setEditingMemorial(item || 'new');
    setMemorialErrors({});
    setMemorialForm(
      item
        ? {
            name: item.name,
            initial: item.initial,
            generation: item.generation,
            deathDate: inputDate(item.deathDate),
            memorialDate: inputDate(item.memorialDate),
            lunarDate: item.lunarDate,
            relationship: item.relationship,
            reminder: item.reminder,
            notes: item.notes,
          }
        : EMPTY_MEMORIAL_FORM
    );
  };

  const handleSaveMemorial = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!memorialForm.name.trim()) errors.name = 'Vui lòng nhập tên người đã mất.';
    if (!memorialForm.deathDate) errors.deathDate = 'Vui lòng chọn ngày mất.';
    if (!memorialForm.memorialDate) errors.memorialDate = 'Vui lòng chọn ngày tưởng niệm.';
    if (!memorialForm.relationship.trim()) errors.relationship = 'Vui lòng nhập mối quan hệ.';
    setMemorialErrors(errors);
    if (Object.keys(errors).length) return;

    const existing = editingMemorial !== 'new' ? editingMemorial : null;
    const record: MemorialRecord = {
      ...memorialForm,
      id: existing?.id || `GT-${String(Date.now()).slice(-5)}`,
      initial: memorialForm.initial || memorialForm.name.trim().charAt(0).toUpperCase(),
      deathDate: displayDate(memorialForm.deathDate),
      memorialDate: displayDate(memorialForm.memorialDate),
      lunarDate: memorialForm.lunarDate.trim() || 'Chưa cập nhật ngày Âm lịch',
    };

    setMemorials((current) =>
      existing ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]
    );
    setSelectedMemorial(record);
    setEditingMemorial(null);
    setToast(existing ? 'Đã cập nhật ngày tưởng niệm.' : 'Đã thêm ngày tưởng niệm mới.');
  };

  const toggleReminder = (item: MemorialRecord) => {
    setMemorials((current) =>
      current.map((record) => (record.id === item.id ? { ...record, reminder: !record.reminder } : record))
    );
    setToast(item.reminder ? `Đã tắt nhắc lịch cho ${item.name}.` : `Đã bật nhắc lịch cho ${item.name}.`);
  };

  return (
    <section className="family-events-page" aria-labelledby="family-events-title">
      {/* 1. CLAN PROFILE STYLE HERO BANNER */}
      <header className="family-events-hero">
        <div className="family-events-hero-top">
          <div className="hero-title-group">
            <h1 id="family-events-title">Sự kiện & Ngày giỗ dòng họ</h1>
            <div className="hero-badges">
              <span className="clan-tag code">
                {canManage ? 'Quản trị gia tộc' : 'Chế độ xem: Thành viên'}
              </span>
              <span className="clan-tag active">Trạng thái: Đang hoạt động</span>
              <span className="clan-tag sync">Dữ liệu: Đã đồng bộ</span>
            </div>
          </div>
          <div className="hero-actions">
            {activeTab === 'events' && (
              <button
                type="button"
                className="event-primary"
                disabled={!canManage}
                title={!canManage ? 'Chỉ Chủ dòng họ có quyền tạo sự kiện' : undefined}
                onClick={() => openEventForm()}
              >
                <FeatureIcon name="plus" /> Thêm sự kiện
              </button>
            )}
            {activeTab === 'memorials' && (
              <button
                type="button"
                className="event-primary"
                disabled={!canManage}
                onClick={() => openMemorialForm()}
              >
                <FeatureIcon name="plus" /> Thêm ngày giỗ
              </button>
            )}
            {activeTab === 'timeline' && (
              <button
                type="button"
                className="event-primary"
                disabled={!canManage}
                onClick={() => openEventForm()}
              >
                <FeatureIcon name="plus" /> Thêm hoạt động
              </button>
            )}
          </div>
        </div>

        {/* 4 STATS CARDS DIRECTLY INSIDE HERO (MATCHING CLAN PROFILE PAGE) */}
        <div className="event-kpis">
          <article>
            <span>SỰ KIỆN SẮP TỚI</span>
            <strong>{upcomingEventsCount} sự kiện</strong>
          </article>
          <article>
            <span>NGÀY GIỖ GẦN NHẤT</span>
            <strong style={{ fontSize: '18px' }}>
              {nearestMemorial.split('–')[0]?.trim()}
            </strong>
          </article>
          <article>
            <span>ĐANG BẬT NHẮC LỊCH</span>
            <strong>{reminderActiveCount} / {memorials.length} ngày giỗ</strong>
          </article>
          <article>
            <span>TỔNG NGƯỜI THAM DỰ</span>
            <strong>{totalParticipants} lượt</strong>
          </article>
        </div>
      </header>

      {!canManage && (
        <div className="event-role-note">
          <FeatureIcon name="lock" />
          <span>
            <strong>Chế độ xem Thành viên:</strong> Bạn có thể theo dõi sự kiện, bật/tắt nhắc lịch và phản hồi tham dự (RSVP). Quyền tạo hoặc chỉnh sửa dành cho Ban Quản trị.
          </span>
        </div>
      )}

      {/* 2. SUB-TABS SWITCHER */}
      <nav className="events-tabs-bar" aria-label="Phân hệ sự kiện và ngày giỗ">
        <div className="events-tabs-group">
          <button
            type="button"
            className={`events-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Sự kiện gia tộc
            <span className="events-tab-badge">{events.length}</span>
          </button>
          <button
            type="button"
            className={`events-tab-btn ${activeTab === 'memorials' ? 'active' : ''}`}
            onClick={() => setActiveTab('memorials')}
          >
            Lịch ngày giỗ
            <span className="events-tab-badge">{memorials.length}</span>
          </button>
          <button
            type="button"
            className={`events-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Lịch chung dòng họ
            <span className="events-tab-badge">{events.length + memorials.length}</span>
          </button>
        </div>
      </nav>

      {/* 4. MAIN CONTENT CARD */}
      <div className="event-list-card">
        {/* TAB 1: SỰ KIỆN GIA TỘC */}
        {activeTab === 'events' && (
          <>
            <div className="event-toolbar">
              <label>
                <FeatureIcon name="search" />
                <input
                  aria-label="Tìm sự kiện"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  placeholder="Tìm tên sự kiện, địa điểm, đơn vị tổ chức..."
                />
              </label>
              <select
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value as typeof eventTypeFilter)}
                aria-label="Lọc loại sự kiện"
              >
                <option value="all">Tất cả loại sự kiện</option>
                <option value="ceremony">Nghi lễ tế tổ</option>
                <option value="meeting">Họp dòng họ</option>
                <option value="scholarship">Khuyến học</option>
                <option value="trip">Về nguồn</option>
              </select>
              <select
                value={eventStatusFilter}
                onChange={(e) => setEventStatusFilter(e.target.value as typeof eventStatusFilter)}
                aria-label="Lọc trạng thái"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="upcoming">Sắp diễn ra</option>
                <option value="ongoing">Đang diễn ra</option>
                <option value="completed">Đã kết thúc</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>

            {visibleEvents.length ? (
              <div className="event-grid">
                {visibleEvents.map((item) => (
                  <article className="event-card" key={item.id}>
                    <div className="event-card-top">
                      <span className={`event-type ${item.type}`}>{typeLabels[item.type] || item.type}</span>
                      <span className={`event-status ${item.status}`}>{statusLabels[item.status]}</span>
                    </div>
                    <h2>{item.name}</h2>
                    <p>{item.description}</p>
                    <div className="event-info-grid">
                      <div>
                        <FeatureIcon name="calendar" />
                        <div>
                          <small>Ngày & giờ</small>
                          <strong>
                            {item.startDate}
                            {item.endDate && item.endDate !== item.startDate ? ` – ${item.endDate}` : ''} • {item.time}
                          </strong>
                        </div>
                      </div>
                      <div>
                        <span className="event-pin">⌖</span>
                        <div>
                          <small>Địa điểm</small>
                          <strong>{item.location}</strong>
                          {item.location && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.location)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                color: '#0f172a',
                                fontWeight: 500,
                                fontSize: '11px',
                                textDecoration: 'underline',
                                marginTop: '2px',
                              }}
                            >
                              Chỉ đường Maps
                            </a>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="event-user">◎</span>
                        <div>
                          <small>Đơn vị tổ chức</small>
                          <strong>{item.organizer}</strong>
                        </div>
                      </div>
                      <div>
                        <span className="event-user">◉</span>
                        <div>
                          <small>Người tham dự</small>
                          <strong>{item.participants.length} thành viên</strong>
                        </div>
                      </div>
                    </div>
                    <footer>
                      <button type="button" className="event-view" onClick={() => setSelectedEvent(item)}>
                        <FeatureIcon name="eye" /> Xem chi tiết
                      </button>
                      <button
                        type="button"
                        disabled={!canManage}
                        title={!canManage ? 'Không có quyền chỉnh sửa' : undefined}
                        onClick={() => openEventForm(item)}
                      >
                        <FeatureIcon name="edit" /> Sửa
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!canManage}
                        title={!canManage ? 'Không có quyền xóa' : undefined}
                        onClick={() => setDeleteEventTarget(item)}
                      >
                        <FeatureIcon name="delete" />
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <FeatureEmptyState
                title="Không tìm thấy sự kiện phù hợp"
                description="Thử thay đổi từ khóa hoặc bộ lọc để xem các hoạt động khác của dòng họ."
                action={
                  <button type="button" className="event-primary" onClick={() => openEventForm()}>
                    Tạo sự kiện mới
                  </button>
                }
              />
            )}

            <div className="event-pagination-row">
              <span>Hiển thị {visibleEvents.length} / {filteredEvents.length} sự kiện</span>
              <FeaturePagination
                page={eventPage}
                totalPages={totalEventPages}
                onChange={setEventPage}
              />
            </div>
          </>
        )}

        {/* TAB 2: LỊCH NGÀY GIỖ */}
        {activeTab === 'memorials' && (
          <>
            <div className="event-toolbar">
              <label>
                <FeatureIcon name="search" />
                <input
                  aria-label="Tìm ngày giỗ"
                  value={memorialSearch}
                  onChange={(e) => setMemorialSearch(e.target.value)}
                  placeholder="Tìm tên tiền nhân, vai vế, quan hệ hoặc ghi chú cúng giỗ..."
                />
              </label>
              <select
                aria-label="Lọc nhắc lịch"
                value={reminderFilter}
                onChange={(e) => setReminderFilter(e.target.value as typeof reminderFilter)}
              >
                <option value="all">Tất cả ngày giỗ</option>
                <option value="on">Đang bật nhắc lịch</option>
                <option value="off">Đang tắt nhắc lịch</option>
              </select>
              <select
                aria-label="Sắp xếp"
                value={memorialSort}
                onChange={(e) => setMemorialSort(e.target.value as typeof memorialSort)}
              >
                <option value="date">Sắp theo ngày tưởng niệm</option>
                <option value="generation">Sắp theo đời (Thế hệ)</option>
                <option value="name">Sắp theo tên A–Z</option>
              </select>
            </div>

            {visibleMemorials.length ? (
              <div className="memorial-grid">
                {visibleMemorials.map((item) => (
                  <article className="memorial-item" key={item.id}>
                    <div className="memorial-item-head">
                      <div className="memorial-avatar">{item.initial}</div>
                      <div>
                        <span className="gen-tag">Đời {item.generation}</span>
                        <h2>{item.name}</h2>
                        <small>{item.relationship}</small>
                      </div>
                      <div className="memorial-reminder-toggle">
                        <button
                          type="button"
                          className={`memorial-reminder ${item.reminder ? 'on' : ''}`}
                          onClick={() => toggleReminder(item)}
                          aria-pressed={item.reminder}
                          title={item.reminder ? 'Tắt nhắc lịch' : 'Bật nhắc lịch'}
                        >
                          <span />
                        </button>
                        <small style={{ fontSize: 10, color: '#0f172a', fontWeight: 500 }}>
                          {item.reminder ? 'Bật nhắc' : 'Tắt'}
                        </small>
                      </div>
                    </div>

                    <div className="memorial-date-panel">
                      <FeatureIcon name="calendar" />
                      <div>
                        <span>Ngày tưởng niệm hàng năm</span>
                        <strong>{item.memorialDate} (Dương lịch)</strong>
                        <small>{item.lunarDate}</small>
                      </div>
                    </div>

                    <dl>
                      <div>
                        <dt>Ngày mất chính xác</dt>
                        <dd>{item.deathDate}</dd>
                      </div>
                      <div>
                        <dt>Trạng thái nhắc lịch</dt>
                        <dd>{item.reminder ? 'Nhắc trước 7 ngày' : 'Đang tắt'}</dd>
                      </div>
                    </dl>

                    <p>{item.notes || 'Chưa có ghi chú nghi lễ cúng tế.'}</p>

                    <footer>
                      <button type="button" onClick={() => setSelectedMemorial(item)}>
                        <FeatureIcon name="eye" /> Chi tiết
                      </button>
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => openMemorialForm(item)}
                      >
                        <FeatureIcon name="edit" /> Sửa
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!canManage}
                        onClick={() => setDeleteMemorialTarget(item)}
                      >
                        <FeatureIcon name="delete" />
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <FeatureEmptyState
                title="Không tìm thấy ngày giỗ phù hợp"
                description="Không có dữ liệu phù hợp với từ khóa và bộ lọc hiện tại."
                action={
                  <button type="button" className="event-primary" onClick={() => openMemorialForm()}>
                    Thêm ngày tưởng niệm mới
                  </button>
                }
              />
            )}

            <div className="event-pagination-row">
              <span>Hiển thị {visibleMemorials.length} / {filteredMemorials.length} mục</span>
              <FeaturePagination
                page={memorialPage}
                totalPages={totalMemorialPages}
                onChange={setMemorialPage}
              />
            </div>
          </>
        )}

        {/* TAB 3: LỊCH CHUNG DÒNG HỌ (TIMELINE VIEW) */}
        {activeTab === 'timeline' && (
          <>
            <div className="event-toolbar">
              <label>
                <FeatureIcon name="search" />
                <input
                  aria-label="Tìm trong lịch chung"
                  value={timelineSearch}
                  onChange={(e) => setTimelineSearch(e.target.value)}
                  placeholder="Tìm sự kiện hoặc ngày giỗ theo tên, địa điểm, thời gian..."
                />
              </label>
              <select
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value as typeof timelineFilter)}
                aria-label="Lọc loại hoạt động"
              >
                <option value="all">Tất cả hoạt động</option>
                <option value="events">Chỉ xem Sự kiện gia tộc</option>
                <option value="memorials">Chỉ xem Lịch ngày giỗ</option>
              </select>
            </div>

            {combinedTimeline.length ? (
              <div className="timeline-list">
                {combinedTimeline.map((item) => (
                  <div className="timeline-row" key={`${item.itemType}-${item.id}`}>
                    <div className={`timeline-date-box ${item.itemType}`}>
                      <strong>{item.dateStr.split('/')[0] || ''}/{item.dateStr.split('/')[1] || ''}</strong>
                      <small>{item.itemType === 'memorial' ? 'Ngày Giỗ' : 'Sự kiện'}</small>
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-tag-row">
                        <span className={`timeline-badge ${item.itemType}`}>{item.badgeText}</span>
                        <small style={{ color: '#64748b' }}>{item.subDate}</small>
                      </div>
                      <h3 className="timeline-title">{item.title}</h3>
                      <p className="timeline-desc">{item.desc}</p>
                    </div>
                    <div className="timeline-actions">
                      {item.itemType === 'event' && item.originalEvent && (
                        <button
                          type="button"
                          className="event-card footer button event-view"
                          onClick={() => setSelectedEvent(item.originalEvent!)}
                          style={{
                            padding: '8px 14px',
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                          }}
                        >
                          Xem sự kiện
                        </button>
                      )}
                      {item.itemType === 'memorial' && item.originalMemorial && (
                        <button
                          type="button"
                          onClick={() => setSelectedMemorial(item.originalMemorial!)}
                          style={{
                            padding: '8px 14px',
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                          }}
                        >
                          Xem ngày giỗ
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <FeatureEmptyState
                title="Không có hoạt động nào"
                description="Không tìm thấy sự kiện hay ngày giỗ nào khớp với bộ lọc."
              />
            )}
          </>
        )}
      </div>

      {/* ===== MODALS & DIALOGS ===== */}

      {/* 1. MODAL TẠO/SỬA SỰ KIỆN */}
      {editingEvent && (
        <FeatureModal
          title={editingEvent === 'new' ? 'Tạo sự kiện gia tộc mới' : 'Chỉnh sửa sự kiện gia tộc'}
          eyebrow="QUẢN LÝ SỰ KIỆN"
          onClose={() => setEditingEvent(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="feature-button secondary"
                onClick={() => setEditingEvent(null)}
              >
                Hủy
              </button>
              <button type="submit" form="family-event-form" className="feature-button primary">
                <FeatureIcon name="check" /> Lưu sự kiện
              </button>
            </>
          }
        >
          <form id="family-event-form" className="feature-form-grid" onSubmit={handleSaveEvent} noValidate>
            <div className="feature-field full">
              <label>Tên sự kiện <em>*</em></label>
              <input
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                placeholder="Ví dụ: Đại hội dòng họ thường niên 2026"
              />
              {eventErrors.name && <span className="feature-field-error">{eventErrors.name}</span>}
            </div>
            <div className="feature-field">
              <label>Loại sự kiện</label>
              <select
                value={eventForm.type}
                onChange={(e) => setEventForm({ ...eventForm, type: e.target.value as EventForm['type'] })}
              >
                <option value="ceremony">Nghi lễ tế tổ</option>
                <option value="meeting">Họp dòng họ</option>
                <option value="scholarship">Khuyến học</option>
                <option value="trip">Về nguồn</option>
              </select>
            </div>
            <div className="feature-field">
              <label>Trạng thái</label>
              <select
                value={eventForm.status}
                onChange={(e) => setEventForm({ ...eventForm, status: e.target.value as EventStatus })}
              >
                <option value="upcoming">Sắp diễn ra</option>
                <option value="ongoing">Đang diễn ra</option>
                <option value="completed">Đã kết thúc</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>
            <div className="feature-field full">
              <label>Mô tả mục đích</label>
              <textarea
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                placeholder="Mô tả tóm tắt nội dung và mục đích sự kiện..."
              />
            </div>
            <div className="feature-field">
              <label>Ngày bắt đầu <em>*</em></label>
              <input
                type="date"
                value={eventForm.startDate}
                onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
              />
              {eventErrors.startDate && <span className="feature-field-error">{eventErrors.startDate}</span>}
            </div>
            <div className="feature-field">
              <label>Ngày kết thúc <em>*</em></label>
              <input
                type="date"
                value={eventForm.endDate}
                onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
              />
              {eventErrors.endDate && <span className="feature-field-error">{eventErrors.endDate}</span>}
            </div>
            <div className="feature-field">
              <label>Thời gian <em>*</em></label>
              <input
                value={eventForm.time}
                onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                placeholder="Ví dụ: 07:30 – 16:30"
              />
              {eventErrors.time && <span className="feature-field-error">{eventErrors.time}</span>}
            </div>
            <div className="feature-field">
              <label>Địa điểm tổ chức <em>*</em></label>
              <input
                value={eventForm.location}
                onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                placeholder="Địa chỉ nhà thờ họ / địa điểm họp"
              />
              {eventErrors.location && <span className="feature-field-error">{eventErrors.location}</span>}
            </div>
            <div className="feature-field full">
              <label>Đơn vị / Ban tổ chức <em>*</em></label>
              <input
                value={eventForm.organizer}
                onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
                placeholder="Ví dụ: Hội đồng gia tộc / Ban trị sự"
              />
              {eventErrors.organizer && <span className="feature-field-error">{eventErrors.organizer}</span>}
            </div>
            <div className="feature-field full">
              <label>Ghi chú thêm</label>
              <textarea
                value={eventForm.notes}
                onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                placeholder="Trang phục, phương tiện đi lại, hạn đăng ký..."
              />
            </div>
          </form>
        </FeatureModal>
      )}

      {/* 2. MODAL CHI TIẾT SỰ KIỆN & QUẢN LÝ NGƯỜI THAM DỰ */}
      {selectedEvent && (
        <FeatureModal
          title={selectedEvent.name}
          eyebrow={`${typeLabels[selectedEvent.type] || selectedEvent.type} • ${statusLabels[selectedEvent.status]}`}
          onClose={() => setSelectedEvent(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="feature-button secondary"
                onClick={() => setSelectedEvent(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="feature-button primary"
                disabled={!canManage}
                onClick={() => {
                  const target = selectedEvent;
                  setSelectedEvent(null);
                  openEventForm(target);
                }}
              >
                <FeatureIcon name="edit" /> Chỉnh sửa
              </button>
            </>
          }
        >
          <div className="event-detail-summary">
            <p>{selectedEvent.description}</p>
            <dl>
              <div>
                <dt>Thời gian</dt>
                <dd>
                  {selectedEvent.startDate}
                  {selectedEvent.endDate !== selectedEvent.startDate ? ` – ${selectedEvent.endDate}` : ''} • {selectedEvent.time}
                </dd>
              </div>
              <div>
                <dt>Địa điểm</dt>
                <dd>
                  {selectedEvent.location}
                  {selectedEvent.location && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedEvent.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginLeft: '8px',
                        color: '#0f172a',
                        fontWeight: 500,
                        fontSize: '12px',
                        textDecoration: 'underline',
                      }}
                    >
                      Mở Google Maps
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt>Đơn vị tổ chức</dt>
                <dd>{selectedEvent.organizer}</dd>
              </div>
              <div>
                <dt>Ghi chú</dt>
                <dd>{selectedEvent.notes || 'Không có ghi chú'}</dd>
              </div>
            </dl>
          </div>

          <div className="participant-section">
            <div className="participant-title">
              <div>
                <h3>Danh sách người tham dự</h3>
                <span>{selectedEvent.participants.length} thành viên đã đăng ký</span>
              </div>
            </div>

            {canManage && (
              <div className="participant-add">
                <input
                  aria-label="Tên thành viên"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Nhập tên thành viên..."
                />
                <input
                  aria-label="Quan hệ / Đời"
                  value={participantRelationship}
                  onChange={(e) => setParticipantRelationship(e.target.value)}
                  placeholder="Ví dụ: Đời 4 / Chi 2"
                />
                <button type="button" onClick={addParticipant} disabled={!participantName.trim()}>
                  <FeatureIcon name="plus" /> Thêm
                </button>
              </div>
            )}

            <div className="participant-list">
              {selectedEvent.participants.length ? (
                selectedEvent.participants.map((person) => (
                  <div key={person.id}>
                    <span className="participant-avatar">{person.initial}</span>
                    <div>
                      <strong>{person.name}</strong>
                      <small>{person.relationship}</small>
                    </div>
                    <select
                      aria-label={`RSVP của ${person.name}`}
                      value={person.rsvp}
                      disabled={!canManage}
                      onChange={(e) => updateRsvp(person.id, e.target.value as EventParticipant['rsvp'])}
                    >
                      <option value="confirmed">Đã xác nhận</option>
                      <option value="pending">Chờ phản hồi</option>
                      <option value="declined">Không tham dự</option>
                    </select>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setRemoveParticipant(person)}
                      aria-label={`Xóa ${person.name}`}
                    >
                      <FeatureIcon name="delete" />
                    </button>
                  </div>
                ))
              ) : (
                <FeatureEmptyState
                  title="Chưa có người tham dự"
                  description="Hãy thêm thành viên để theo dõi xác nhận tham gia sự kiện."
                />
              )}
            </div>
          </div>
        </FeatureModal>
      )}

      {/* 3. MODAL TẠO/SỬA NGÀY GIỖ */}
      {editingMemorial && (
        <FeatureModal
          title={editingMemorial === 'new' ? 'Thêm ngày giỗ tiền nhân' : 'Chỉnh sửa thông tin ngày giỗ'}
          eyebrow="LỊCH TƯỞNG NIỆM GIA TỘC"
          onClose={() => setEditingMemorial(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="feature-button secondary"
                onClick={() => setEditingMemorial(null)}
              >
                Hủy
              </button>
              <button type="submit" form="memorial-form" className="feature-button primary">
                <FeatureIcon name="check" /> Lưu ngày giỗ
              </button>
            </>
          }
        >
          <form id="memorial-form" className="feature-form-grid" onSubmit={handleSaveMemorial} noValidate>
            <div className="feature-field">
              <label>Họ tên người đã mất <em>*</em></label>
              <input
                value={memorialForm.name}
                onChange={(e) => setMemorialForm({ ...memorialForm, name: e.target.value })}
                placeholder="Ví dụ: Cụ Nguyễn Văn Tông"
              />
              {memorialErrors.name && <span className="feature-field-error">{memorialErrors.name}</span>}
            </div>
            <div className="feature-field">
              <label>Đời (Thế hệ) <em>*</em></label>
              <input
                type="number"
                min="1"
                max="50"
                value={memorialForm.generation}
                onChange={(e) =>
                  setMemorialForm({ ...memorialForm, generation: Number(e.target.value) || 1 })
                }
              />
            </div>
            <div className="feature-field">
              <label>Ngày mất (Dương lịch) <em>*</em></label>
              <input
                type="date"
                value={memorialForm.deathDate}
                onChange={(e) => setMemorialForm({ ...memorialForm, deathDate: e.target.value })}
              />
              {memorialErrors.deathDate && (
                <span className="feature-field-error">{memorialErrors.deathDate}</span>
              )}
            </div>
            <div className="feature-field">
              <label>Ngày cúng tưởng niệm (Dương lịch) <em>*</em></label>
              <input
                type="date"
                value={memorialForm.memorialDate}
                onChange={(e) => setMemorialForm({ ...memorialForm, memorialDate: e.target.value })}
              />
              {memorialErrors.memorialDate && (
                <span className="feature-field-error">{memorialErrors.memorialDate}</span>
              )}
            </div>
            <div className="feature-field">
              <label>Ngày Âm lịch tương ứng</label>
              <input
                value={memorialForm.lunarDate}
                onChange={(e) => setMemorialForm({ ...memorialForm, lunarDate: e.target.value })}
                placeholder="Ví dụ: 15/08 Âm lịch"
              />
            </div>
            <div className="feature-field">
              <label>Mối quan hệ / Vai vế trong họ <em>*</em></label>
              <input
                value={memorialForm.relationship}
                onChange={(e) => setMemorialForm({ ...memorialForm, relationship: e.target.value })}
                placeholder="Ví dụ: Thủy Tổ Chi Trưởng"
              />
              {memorialErrors.relationship && (
                <span className="feature-field-error">{memorialErrors.relationship}</span>
              )}
            </div>
            <div className="feature-field full">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={memorialForm.reminder}
                  onChange={(e) => setMemorialForm({ ...memorialForm, reminder: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
                <span style={{ fontWeight: 500, color: '#0f172a' }}>Bật nhắc lịch tự động trước 7 ngày</span>
              </label>
            </div>
            <div className="feature-field full">
              <label>Ghi chú nghi lễ cúng giỗ</label>
              <textarea
                value={memorialForm.notes}
                onChange={(e) => setMemorialForm({ ...memorialForm, notes: e.target.value })}
                placeholder="Địa điểm từ đường cúng tế, con cháu chi nhánh chuẩn bị lễ vật..."
              />
            </div>
          </form>
        </FeatureModal>
      )}

      {/* 4. MODAL CHI TIẾT NGÀY GIỖ */}
      {selectedMemorial && (
        <FeatureModal
          title={`Ngày giỗ ${selectedMemorial.name}`}
          eyebrow={`ĐỜI ${selectedMemorial.generation} • ${selectedMemorial.relationship}`}
          onClose={() => setSelectedMemorial(null)}
          wide
          footer={
            <>
              <button
                type="button"
                className="feature-button secondary"
                onClick={() => setSelectedMemorial(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="feature-button primary"
                disabled={!canManage}
                onClick={() => {
                  const target = selectedMemorial;
                  setSelectedMemorial(null);
                  openMemorialForm(target);
                }}
              >
                <FeatureIcon name="edit" /> Chỉnh sửa
              </button>
            </>
          }
        >
          <div className="event-detail-summary">
            <dl>
              <div>
                <dt>Người được tưởng niệm</dt>
                <dd>
                  <strong>{selectedMemorial.name}</strong> (Đời {selectedMemorial.generation})
                </dd>
              </div>
              <div>
                <dt>Mối quan hệ dòng tộc</dt>
                <dd>{selectedMemorial.relationship}</dd>
              </div>
              <div>
                <dt>Ngày giỗ hàng năm</dt>
                <dd>
                  {selectedMemorial.memorialDate} (Dương lịch) •{' '}
                  <strong>{selectedMemorial.lunarDate}</strong>
                </dd>
              </div>
              <div>
                <dt>Ngày mất</dt>
                <dd>{selectedMemorial.deathDate}</dd>
              </div>
              <div>
                <dt>Trạng thái nhắc lịch</dt>
                <dd>{selectedMemorial.reminder ? 'Đang bật (Nhắc trước 7 ngày)' : 'Đang tắt'}</dd>
              </div>
              <div>
                <dt>Ghi chú cúng lễ</dt>
                <dd>{selectedMemorial.notes || 'Không có ghi chú thêm'}</dd>
              </div>
            </dl>
          </div>
        </FeatureModal>
      )}

      {/* 5. CONFIRM DELETE EVENT */}
      {deleteEventTarget && (
        <ConfirmDialog
          title="Xóa sự kiện gia tộc?"
          description={`Sự kiện “${deleteEventTarget.name}” và danh sách người tham dự sẽ bị xóa khỏi lịch.`}
          confirmLabel="Xóa sự kiện"
          danger
          onCancel={() => setDeleteEventTarget(null)}
          onConfirm={() => {
            setEvents((current) => current.filter((item) => item.id !== deleteEventTarget.id));
            setDeleteEventTarget(null);
            setToast('Đã xóa sự kiện thành công.');
          }}
        />
      )}

      {/* 6. CONFIRM DELETE MEMORIAL */}
      {deleteMemorialTarget && (
        <ConfirmDialog
          title="Xóa ngày giỗ tưởng niệm?"
          description={`Ngày giỗ của “${deleteMemorialTarget.name}” sẽ bị xóa khỏi lịch cúng tế của dòng họ.`}
          confirmLabel="Xóa ngày giỗ"
          danger
          onCancel={() => setDeleteMemorialTarget(null)}
          onConfirm={() => {
            setMemorials((current) => current.filter((item) => item.id !== deleteMemorialTarget.id));
            setDeleteMemorialTarget(null);
            setToast('Đã xóa ngày giỗ thành công.');
          }}
        />
      )}

      {/* 7. CONFIRM REMOVE PARTICIPANT */}
      {removeParticipant && (
        <ConfirmDialog
          title="Xóa người tham dự?"
          description={`Xóa ${removeParticipant.name} khỏi danh sách tham gia sự kiện này?`}
          confirmLabel="Xóa khỏi danh sách"
          danger
          onCancel={() => setRemoveParticipant(null)}
          onConfirm={removeSelectedParticipant}
        />
      )}

      {/* TOAST NOTIFICATION */}
      {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
    </section>
  );
};

export default ClanEventsModule;
