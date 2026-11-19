import React, { useState, useRef, useEffect } from 'react';
import { useClanContext } from '../../context/ClanContext';
import { sendAIChatMessage } from '../../services/ai.service';
import type { AIChatMessage, AIPersonCandidate } from '../../types/ai';
import './FloatingAIAssistant.css';

interface FloatingAIAssistantProps {
  clanId?: string;
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  rawDate: number;
}

/**
 * Trình dựng văn bản sạch đẹp, loại bỏ hoàn toàn các ký tự dấu sao (*)
 * và chuyển đổi markdown thành cấu trúc HTML rõ ràng.
 */
function renderCleanFormattedText(text: string): React.ReactNode {
  if (!text) return null;

  const rawLines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentListItems: string[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="floating-chat-list">
          {currentListItems.map((item, idx) => (
            <li key={idx} className="floating-chat-item">
              <span className="floating-bullet-dot">•</span>
              <span>{renderInlineBold(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentListItems = [];
    }
  };

  const renderInlineBold = (str: string) => {
    let clean = str.replace(/^\s*[*\-]\s*\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/^\s*[*\-•]\s*/g, '');
    clean = clean.replace(/\*{3,}/g, '');

    const parts = clean.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2).replace(/\*/g, '').trim();
        return (
          <strong key={pIdx} className="floating-bold-text">
            {inner}
          </strong>
        );
      }
      return part.replace(/\*/g, '');
    });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) {
      flushList();
      continue;
    }

    const isSectionHeader =
      rawLine.startsWith('* **') ||
      rawLine.startsWith('- **') ||
      (rawLine.startsWith('**') && rawLine.endsWith('**')) ||
      (rawLine.startsWith('**') && rawLine.includes(':**'));

    const isBulletItem =
      (rawLine.startsWith('* ') || rawLine.startsWith('- ') || rawLine.startsWith('• ')) &&
      !isSectionHeader;

    if (isSectionHeader) {
      flushList();
      const headerText = rawLine
        .replace(/^[*\-•]\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      blocks.push(
        <div key={`header-${i}`} className="floating-chat-section-header">
          <span className="floating-section-bar" />
          <span className="floating-section-title">{headerText}</span>
        </div>
      );
    } else if (isBulletItem) {
      const itemContent = rawLine.replace(/^[*\-•]\s*/, '').trim();
      currentListItems.push(itemContent);
    } else {
      flushList();
      blocks.push(
        <p key={`p-${i}`} className="floating-chat-paragraph">
          {renderInlineBold(rawLine)}
        </p>
      );
    }
  }

  flushList();
  return <div className="floating-chat-formatted-body">{blocks}</div>;
}

/**
 * Modern High-Tech 3D Robot Mascot SVG Component
 * Thiết kế tinh xảo, hiệu ứng kim loại bóng & kính vát công nghệ cao
 */
const ModernRobotIcon: React.FC<{ size?: number }> = ({ size = 44 }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Polycarbonate Glossy Helmet Gradient */}
        <linearGradient id="mfgRobotShell" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="65%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>

        {/* Curved Obsidian Visor Gradient */}
        <linearGradient id="mfgRobotVisor" x1="32" y1="20" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#090d16" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>

        {/* Specular Light Reflection on Upper Visor */}
        <linearGradient id="mfgRobotGlassReflect" x1="32" y1="20" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
        </linearGradient>

        {/* Cyber Luminous Cyan LED Gradient */}
        <linearGradient id="mfgRobotCyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>

        {/* Chrome Ear Pod Gradient */}
        <linearGradient id="mfgRobotEar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="50%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>

        {/* Cybernetic Glow Filter */}
        <filter id="mfgCyberGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Aerodynamic Fin / Antenna */}
      <path d="M32 16V8" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="7" r="4.5" fill="url(#mfgRobotCyan)" filter="url(#mfgCyberGlow)" />
      <circle cx="32" cy="7" r="2" fill="#ffffff" />

      {/* Acoustic Side Ear Pods */}
      <rect x="7" y="24" width="6" height="16" rx="3" fill="url(#mfgRobotEar)" />
      <rect x="9" y="27" width="2" height="10" rx="1" fill="#38bdf8" />
      <rect x="51" y="24" width="6" height="16" rx="3" fill="url(#mfgRobotEar)" />
      <rect x="53" y="27" width="2" height="10" rx="1" fill="#38bdf8" />

      {/* Outer Head Polycarbonate Shell */}
      <rect x="11" y="14" width="42" height="36" rx="16" fill="url(#mfgRobotShell)" />
      <rect x="11.5" y="14.5" width="41" height="35" rx="15.5" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.8" />

      {/* Deep Obsidian Screen / Visor */}
      <rect x="16" y="20" width="32" height="22" rx="9" fill="url(#mfgRobotVisor)" />

      {/* Glass Arc Reflection */}
      <path
        d="M17 28C17 23.58 20.58 20 25 20H39C43.42 20 47 23.58 47 28C47 24.5 40 21.5 32 21.5C24 21.5 17 24.5 17 28Z"
        fill="url(#mfgRobotGlassReflect)"
      />

      {/* Glowing Cybernetic Digital Eyes */}
      <g filter="url(#mfgCyberGlow)">
        <rect x="22" y="26" width="6" height="7" rx="3" fill="url(#mfgRobotCyan)" />
        <rect x="36" y="26" width="6" height="7" rx="3" fill="url(#mfgRobotCyan)" />
        <circle cx="24" cy="27.5" r="1.1" fill="#ffffff" />
        <circle cx="38" cy="27.5" r="1.1" fill="#ffffff" />
      </g>

      {/* Digital Curved Smile */}
      <path
        d="M26 36C28 38 36 38 38 36"
        stroke="#38bdf8"
        strokeWidth="2.2"
        strokeLinecap="round"
        filter="url(#mfgCyberGlow)"
      />

      {/* High-Tech Neck Collar */}
      <path d="M24 50H40L37 54H27L24 50Z" fill="#94a3b8" />
      <rect x="29" y="51" width="6" height="2" rx="1" fill="#38bdf8" />
    </svg>
  );
};

export const FloatingAIAssistant: React.FC<FloatingAIAssistantProps> = ({
  clanId: propClanId,
  isOpenExternal,
  onCloseExternal,
}) => {
  const { activeClanId, activeClanName } = useClanContext();
  const effectiveClanId = propClanId || activeClanId;

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'history'>('chat');
  const [showTooltip, setShowTooltip] = useState(false);

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [clanAiDisabled, setClanAiDisabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'ai',
      text: 'Xin chào! Tôi là Trợ lý AI Phả Hệ của dòng họ. Hãy đặt câu hỏi bất kỳ về thủy tổ, thế hệ, thành viên hoặc cách xưng hô trong gia tộc.',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      suggested_questions: [
        'Cụ khởi tổ của dòng họ là ai?',
        'Thống kê số lượng thành viên và số thế hệ?',
        'Cách xưng hô giữa các nhánh họ hàng?',
      ],
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external open state if provided
  useEffect(() => {
    if (typeof isOpenExternal === 'boolean') {
      setIsOpen(isOpenExternal);
      if (isOpenExternal) {
        setShowTooltip(false);
      }
    }
  }, [isOpenExternal]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && viewMode === 'chat') {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [isOpen, viewMode, messages, isThinking]);

  // Load saved query history from localStorage
  useEffect(() => {
    if (!effectiveClanId) {
      setQueryHistory([]);
      return;
    }
    try {
      const savedHistory = localStorage.getItem(`mfg_ai_query_history_${effectiveClanId}`);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setQueryHistory(parsed);
        }
      } else {
        setQueryHistory([]);
      }
    } catch {
      setQueryHistory([]);
    }
  }, [effectiveClanId]);

  // Load saved session messages if available
  useEffect(() => {
    if (!effectiveClanId) return;
    try {
      const savedMsgs = sessionStorage.getItem(`mfg_ai_active_msgs_${effectiveClanId}`);
      const savedCid = sessionStorage.getItem(`mfg_ai_active_cid_${effectiveClanId}`);
      if (savedMsgs) {
        const parsed = JSON.parse(savedMsgs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
      if (savedCid) {
        setConversationId(savedCid);
      }
    } catch {}
  }, [effectiveClanId]);

  // Persist session messages
  useEffect(() => {
    if (!effectiveClanId || messages.length <= 1) return;
    try {
      sessionStorage.setItem(`mfg_ai_active_msgs_${effectiveClanId}`, JSON.stringify(messages));
      if (conversationId) {
        sessionStorage.setItem(`mfg_ai_active_cid_${effectiveClanId}`, conversationId);
      }
    } catch {}
  }, [messages, conversationId, effectiveClanId]);

  // Reset conversation when clan changes
  useEffect(() => {
    setConversationId(undefined);
    setClanAiDisabled(false);
    setErrorMessage(null);
  }, [effectiveClanId]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleToggleOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggleOpen = (nextState?: boolean) => {
    const updated = typeof nextState === 'boolean' ? nextState : !isOpen;
    setIsOpen(updated);
    setShowTooltip(false);
    if (!updated && onCloseExternal) {
      onCloseExternal();
    }
  };

  const handleSendMessage = async (textToSend?: string, selectedPersonId?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isThinking) return;

    if (!effectiveClanId) {
      setErrorMessage('Vui lòng chọn một dòng họ từ danh sách trước khi hỏi đáp.');
      return;
    }

    setErrorMessage(null);

    // Save into query history
    const historyItem: QueryHistoryItem = {
      id: `hist-${Date.now()}`,
      query,
      timestamp:
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
        ' • ' +
        new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      rawDate: Date.now(),
    };
    setQueryHistory((prev) => {
      const filtered = prev.filter((item) => item.query.trim().toLowerCase() !== query.toLowerCase());
      const nextHistory = [historyItem, ...filtered].slice(0, 30);
      try {
        localStorage.setItem(`mfg_ai_query_history_${effectiveClanId}`, JSON.stringify(nextHistory));
      } catch (err) {
        console.warn('Failed to save query history', err);
      }
      return nextHistory;
    });

    const userMessage: AIChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputQuery('');
    setIsThinking(true);

    try {
      const response = await sendAIChatMessage(effectiveClanId, {
        message: query,
        conversation_id: conversationId,
        person_id: selectedPersonId,
      });

      if (response.conversation_id) {
        setConversationId(response.conversation_id);
      }

      if (response.status === 'clan_ai_disabled' || response.status === 'feature_disabled') {
        setClanAiDisabled(true);
      } else {
        setClanAiDisabled(false);
      }

      const aiMessage: AIChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.answer,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        sources: response.sources,
        suggested_questions: response.suggested_questions,
        person_candidates: response.person_candidates,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      const errMsg = err?.message || 'Không thể kết nối đến Trợ lý AI. Vui lòng thử lại sau.';
      setErrorMessage(errMsg);

      const errorAiMessage: AIChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: `Hệ thống gặp gián đoạn: ${errMsg}`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorAiMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSelectCandidate = (candidate: AIPersonCandidate) => {
    const followUpQuery = `Xem thông tin của ${candidate.full_name} (Đời ${candidate.generation})`;
    handleSendMessage(followUpQuery, candidate.person_id);
  };

  const handleClearHistory = () => {
    setConversationId(undefined);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        text: 'Cuộc trò chuyện đã được làm mới. Hãy đặt câu hỏi mới về gia phả dòng họ.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        suggested_questions: [
          'Cụ khởi tổ dòng họ là ai?',
          'Thống kê số lượng thành viên dòng họ?',
          'Ý nghĩa truyền thống thờ cúng tổ tiên?',
        ],
      },
    ]);
    if (effectiveClanId) {
      try {
        sessionStorage.removeItem(`mfg_ai_active_msgs_${effectiveClanId}`);
        sessionStorage.removeItem(`mfg_ai_active_cid_${effectiveClanId}`);
      } catch {}
    }
    setErrorMessage(null);
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueryHistory((prev) => {
      const nextHistory = prev.filter((item) => item.id !== id);
      if (effectiveClanId) {
        try {
          localStorage.setItem(`mfg_ai_query_history_${effectiveClanId}`, JSON.stringify(nextHistory));
        } catch (err) {
          console.warn('Failed to update query history', err);
        }
      }
      return nextHistory;
    });
  };

  const handleClearQueryHistory = () => {
    setQueryHistory([]);
    if (effectiveClanId) {
      try {
        localStorage.removeItem(`mfg_ai_query_history_${effectiveClanId}`);
      } catch (err) {
        console.warn('Failed to clear query history', err);
      }
    }
  };

  const handleSelectHistoryQuery = (query: string) => {
    setViewMode('chat');
    handleSendMessage(query);
  };

  // Clean suggestion pills without any emojis
  const quickPills = [
    { label: 'Thủy tổ dòng họ', query: 'Cụ khởi tổ của dòng họ là ai?' },
    { label: 'Thống kê thế hệ', query: 'Thống kê số lượng thành viên và số thế hệ của dòng họ?' },
    { label: 'Cách xưng hô', query: 'Cách xưng hô giữa các nhánh họ hàng trong gia tộc?' },
    { label: 'Ý nghĩa gia phả', query: 'Ý nghĩa của việc gìn giữ gia phả trong gia đình Việt Nam?' },
    { label: 'Thơ chúc thọ', query: 'Viết lời chúc mừng thọ ông bà trang trọng?' },
  ];

  return (
    <>
      {/* 1. Floating Action Button (3D High-Tech Robot Mascot) */}
      <div className="floating-ai-fab-container">
        {showTooltip && !isOpen && (
          <div className="floating-ai-tooltip">
            <span>Trợ lý AI Phả Hệ</span>
          </div>
        )}

        <div className="floating-ai-fab-ripple" />

        <button
          type="button"
          className="floating-ai-fab-button"
          onClick={() => handleToggleOpen()}
          title={isOpen ? 'Đóng Trợ lý AI' : 'Mở Trợ lý AI Phả Hệ'}
          aria-label="Trợ lý AI Phả Hệ"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* New 3D Modern Robot Icon */}
          <ModernRobotIcon size={40} />

          {/* Status Dot */}
          <span className="floating-ai-status-dot" />
        </button>
      </div>

      {/* 2. Floating AI Chat Window */}
      {isOpen && (
        <div className={`floating-ai-window ${isExpanded ? 'is-expanded' : ''}`}>
          {/* Header */}
          <div className="floating-ai-header">
            <div className="floating-ai-header-left">
              <div className="floating-ai-avatar-wrap">
                <ModernRobotIcon size={24} />
                <span className="floating-ai-avatar-dot" />
              </div>
              <div className="floating-ai-header-info">
                <span className="floating-ai-header-title">Trợ Lý AI Phả Hệ</span>
                <span className="floating-ai-header-subtitle">
                  <span className="floating-ai-clan-tag">{activeClanName || 'Dòng họ'}</span>
                  <span>• Trực tuyến</span>
                </span>
              </div>
            </div>

            <div className="floating-ai-header-actions">
              {/* Toggle Chat History Button */}
              <button
                type="button"
                className={`floating-ai-header-btn ${viewMode === 'history' ? 'is-active' : ''}`}
                onClick={() => setViewMode(viewMode === 'history' ? 'chat' : 'history')}
                title={viewMode === 'history' ? 'Quay lại hội thoại' : 'Lịch sử câu hỏi'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>

              {/* Refresh / Clear Chat */}
              <button
                type="button"
                className="floating-ai-header-btn"
                onClick={handleClearHistory}
                disabled={isThinking}
                title="Làm mới cuộc trò chuyện"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>

              {/* Expand / Minimize Window Size */}
              <button
                type="button"
                className="floating-ai-header-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Thu gọn kích thước' : 'Phóng to cửa sổ'}
              >
                {isExpanded ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>

              {/* Close Button */}
              <button
                type="button"
                className="floating-ai-header-btn"
                onClick={() => handleToggleOpen(false)}
                title="Đóng cửa sổ"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: CHAT HISTORY PANEL */}
          {viewMode === 'history' ? (
            <div className="floating-ai-history-panel">
              <div className="floating-ai-history-header">
                <div className="floating-ai-history-title-wrap">
                  <span className="floating-ai-history-title">Lịch sử câu hỏi</span>
                  <span className="floating-ai-history-count">{queryHistory.length}</span>
                </div>
                {queryHistory.length > 0 && (
                  <button
                    type="button"
                    className="floating-ai-history-clear-btn"
                    onClick={handleClearQueryHistory}
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>

              {queryHistory.length === 0 ? (
                <div className="floating-ai-history-empty">
                  <svg className="floating-ai-history-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <div className="floating-ai-history-empty-title">Chưa có lịch sử câu hỏi</div>
                  <div className="floating-ai-history-empty-desc">
                    Khi bạn đặt câu hỏi với Trợ lý AI, danh sách câu hỏi sẽ được tự động lưu lại ở đây để tiện xem lại.
                  </div>
                </div>
              ) : (
                <div className="floating-ai-history-list">
                  {queryHistory.map((item) => (
                    <div
                      key={item.id}
                      className="floating-ai-history-item"
                      onClick={() => handleSelectHistoryQuery(item.query)}
                      title="Nhấn để hỏi lại câu này"
                    >
                      <div className="floating-ai-history-item-content">
                        <span className="floating-ai-history-query">{item.query}</span>
                        <span className="floating-ai-history-time">{item.timestamp}</span>
                      </div>
                      <button
                        type="button"
                        className="floating-ai-history-del-btn"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        title="Xóa câu hỏi này khỏi lịch sử"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="floating-ai-history-footer">
                <button
                  type="button"
                  className="floating-ai-history-back-btn"
                  onClick={() => setViewMode('chat')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  <span>Quay lại cuộc trò chuyện</span>
                </button>
              </div>
            </div>
          ) : (
            /* VIEW MODE 2: ACTIVE CHAT CONVERSATION */
            <>
              {/* Quick Suggestion Pills (Clean text only) */}
              <div className="floating-ai-quick-pills">
                {quickPills.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="floating-ai-pill-btn"
                    onClick={() => handleSendMessage(p.query)}
                    disabled={isThinking}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Warning banner if Clan AI disabled */}
              {clanAiDisabled && (
                <div style={{ padding: '8px 14px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', color: '#b45309', fontSize: '12px' }}>
                  Lưu ý: Trưởng tộc hiện chưa bật AI cho dòng họ này. Dữ liệu gia phả có thể bị giới hạn.
                </div>
              )}

              {/* Error banner */}
              {errorMessage && (
                <div style={{ padding: '8px 14px', background: '#fef2f2', borderBottom: '1px solid #fee2e2', color: '#b91c1c', fontSize: '12px' }}>
                  {errorMessage}
                </div>
              )}

              {/* Messages Box */}
              <div className="floating-ai-messages-box">
                {messages.map((m) => (
                  <div key={m.id} className={`floating-ai-msg-row ${m.sender}`}>
                    <div className="floating-ai-msg-avatar">
                      {m.sender === 'ai' ? 'AI' : 'Tôi'}
                    </div>

                    <div className={`floating-ai-msg-bubble ${m.isError ? 'error-bubble' : ''}`}>
                      {m.sender === 'ai' && !m.isError && (
                        <div className="floating-ai-bubble-header">
                          <span className="floating-ai-badge-role">TRỢ LÝ PHẢ HỆ</span>
                          <span className="floating-ai-badge-source">Dữ liệu nội bộ</span>
                        </div>
                      )}

                      {/* Clean formatted text without raw asterisks */}
                      {renderCleanFormattedText(m.text)}

                      {/* Disambiguation Candidates */}
                      {m.person_candidates && m.person_candidates.length > 0 && (
                        <div className="floating-ai-candidates">
                          <div className="floating-ai-candidates-title">
                            Vui lòng chọn đúng thành viên:
                          </div>
                          <div className="floating-ai-candidates-grid">
                            {m.person_candidates.map((cand) => (
                              <button
                                key={cand.person_id}
                                type="button"
                                className="floating-ai-candidate-pill"
                                onClick={() => handleSelectCandidate(cand)}
                              >
                                {cand.full_name} ({cand.birth_year ? `${cand.birth_year}` : `Đời ${cand.generation}`})
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Suggested questions */}
                      {m.suggested_questions && m.suggested_questions.length > 0 && (
                        <div className="floating-ai-suggestions-box">
                          {m.suggested_questions.map((sq, sIdx) => (
                            <button
                              key={sIdx}
                              type="button"
                              className="floating-ai-suggestion-btn"
                              onClick={() => handleSendMessage(sq)}
                            >
                              <span>{sq}</span>
                              <span style={{ fontSize: '11px', opacity: 0.6 }}>→</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="floating-ai-msg-time">{m.timestamp}</div>
                    </div>
                  </div>
                ))}

                {/* Thinking / Loading Row */}
                {isThinking && (
                  <div className="floating-ai-thinking-row">
                    <div className="floating-ai-thinking-dots">
                      <span className="floating-ai-thinking-dot" />
                      <span className="floating-ai-thinking-dot" />
                      <span className="floating-ai-thinking-dot" />
                    </div>
                    <span className="floating-ai-thinking-text">AI đang tra cứu gia phả...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Footer Input */}
              <div className="floating-ai-footer">
                <form
                  className="floating-ai-input-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    className="floating-ai-input-field"
                    placeholder="Đặt câu hỏi về thủy tổ, cha mẹ, con cái, vai vế..."
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    disabled={isThinking}
                  />
                  <button
                    type="submit"
                    className="floating-ai-send-btn"
                    disabled={!inputQuery.trim() || isThinking}
                    title="Gửi câu hỏi"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </form>
                <div className="floating-ai-footer-note">
                  Dữ liệu gia phả nội bộ an toàn & bảo mật
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default FloatingAIAssistant;
