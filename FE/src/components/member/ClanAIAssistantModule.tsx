import React, { useState, useRef, useEffect } from 'react';
import { useClanContext } from '../../context/ClanContext';
import { sendAIChatMessage } from '../../services/ai.service';
import type { AIChatMessage, AIPersonCandidate } from '../../types/ai';
import './ClanAIAssistantModule.css';

interface ClanAIAssistantModuleProps {
  clanId?: string;
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
        <ul key={`list-${blocks.length}`} className="chat-bullet-list">
          {currentListItems.map((item, idx) => (
            <li key={idx} className="chat-bullet-item">
              <span className="chat-bullet-dot">•</span>
              <span>{renderInlineBold(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentListItems = [];
    }
  };

  const renderInlineBold = (str: string) => {
    // Làm sạch các dấu sao ở đầu dòng hoặc lộn xộn
    let clean = str.replace(/^\s*[*\-]\s*\*\*(.*?)\*\*/g, '$1');
    clean = clean.replace(/^\s*[*\-•]\s*/g, '');
    clean = clean.replace(/\*{3,}/g, '');

    // Bóc tách **chữ đậm**
    const parts = clean.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const inner = part.slice(2, -2).replace(/\*/g, '').trim();
        return (
          <strong key={pIdx} className="chat-bold-highlight">
            {inner}
          </strong>
        );
      }
      // Loại bỏ hoàn toàn dấu sao đơn lẻ còn sót lại
      return part.replace(/\*/g, '');
    });
  };

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i].trim();
    if (!rawLine) {
      flushList();
      continue;
    }

    // 1. Nhận diện tiêu đề mục (dạng * **Tiêu đề:** hoặc **Tiêu đề:**)
    const isSectionHeader =
      rawLine.startsWith('* **') ||
      rawLine.startsWith('- **') ||
      (rawLine.startsWith('**') && rawLine.endsWith('**')) ||
      (rawLine.startsWith('**') && rawLine.includes(':**'));

    // 2. Nhận diện danh sách gạch đầu dòng (* hoặc - hoặc •)
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
        <div key={`header-${i}`} className="chat-section-header">
          <span className="section-header-bar" />
          <span className="section-header-title">{headerText}</span>
        </div>
      );
    } else if (isBulletItem) {
      const itemContent = rawLine.replace(/^[*\-•]\s*/, '').trim();
      currentListItems.push(itemContent);
    } else {
      flushList();
      blocks.push(
        <p key={`p-${i}`} className="chat-paragraph">
          {renderInlineBold(rawLine)}
        </p>
      );
    }
  }

  flushList();
  return <div className="chat-formatted-body">{blocks}</div>;
}

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  rawDate: number;
}

export const ClanAIAssistantModule: React.FC<ClanAIAssistantModuleProps> = ({ clanId: propClanId }) => {
  const { activeClanId, activeClanName } = useClanContext();
  const effectiveClanId = propClanId || activeClanId;

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [activeSideTab, setActiveSideTab] = useState<'faq' | 'history'>('faq');
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'ai',
      text: 'Kính chào Quý thành viên! Tôi là Trợ lý AI Gia Phả MFGMS-AI.\n\nBạn có thể hỏi tôi tự nhiên về:\n- Thủy tổ, tiên tổ và nguồn gốc dòng họ\n- Thông tin thành viên, cha mẹ, con cái, vợ chồng\n- Quan hệ họ hàng, vai vế và cách xưng hô truyền thống\n- Thống kê quy mô thành viên, số lượng thế hệ\n- Ý nghĩa văn hóa, thờ cúng tổ tiên, thơ ca chúc thọ gia đình...',
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      suggested_questions: [
        'Cụ khởi tổ của dòng họ là ai?',
        'Thống kê số lượng thành viên và số thế hệ của dòng họ?',
        'Ý nghĩa của việc gìn giữ gia phả trong gia đình Việt Nam?',
      ],
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [clanAiDisabled, setClanAiDisabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

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

  const handleSendMessage = async (textToSend?: string, selectedPersonId?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isThinking) return;

    if (!effectiveClanId) {
      setErrorMessage('Vui lòng chọn dòng họ từ thanh điều hướng phía trên trước khi đặt câu hỏi.');
      return;
    }

    setErrorMessage(null);

    // Record question into query history
    const historyItem: QueryHistoryItem = {
      id: `hist-${Date.now()}`,
      query,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
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

  const handleDeleteHistoryItem = (id: string) => {
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

  const handleClearHistory = () => {
    setConversationId(undefined);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        text: 'Cuộc trò chuyện đã được làm mới. Quý thành viên có thể đặt câu hỏi mới về gia phả hoặc truyền thống dòng họ.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        suggested_questions: [
          'Cụ khởi tổ dòng họ là ai?',
          'Thống kê số lượng thành viên dòng họ?',
          'Viết một lời chúc mừng thọ ông bà trang trọng?',
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

  return (
    <div className="ai-container">
      {/* Top Header */}
      <div className="ai-header">
        <div className="ai-title-wrap">
          <h2 className="ai-title">
            Trợ Lý AI Gia Phả
            <span className="ai-status-indicator">
              <span className="ai-status-dot" />
              Trực tuyến
            </span>
          </h2>
          <p className="ai-subtitle">
            Hỏi đáp thông minh kết nối dữ liệu gia phả dòng họ{' '}
            <strong className="clan-highlight-name">{activeClanName || 'Dòng họ'}</strong>.
          </p>
        </div>

        <div className="ai-header-actions">
          <button
            type="button"
            className="ai-btn-refresh"
            onClick={handleClearHistory}
            disabled={isThinking}
            title="Làm mới cuộc trò chuyện"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Warning/Error Banners */}
      {clanAiDisabled && (
        <div className="ai-banner warning">
          <span className="ai-banner-icon">Lưu ý</span>
          <div>
            <strong>Tính năng AI dòng họ đang tắt:</strong> Trưởng tộc hiện chưa bật AI cho dòng họ này.
            Các câu hỏi về gia phả sẽ bị hạn chế cho đến khi Trưởng tộc kích hoạt tại mục Cấu hình AI dòng họ.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="ai-banner error">
          <span className="ai-banner-icon">Thông báo</span>
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Main Chat Grid */}
      <div className="ai-layout-grid">
        {/* Left Column: Chat Conversation Stream */}
        <div className="chat-card">
          {/* Top Bar inside Chat Frame */}
          <div className="chat-card-topbar">
            <div className="chat-topbar-left">
              <div className="chat-topbar-avatar-group">
                <div className="chat-mini-avatar">AI</div>
                <div className="chat-topbar-status-pulse" />
              </div>
              <div className="chat-topbar-info">
                <span className="chat-topbar-name">Hội thoại Gia phả</span>
                <span className="chat-topbar-desc">Dữ liệu nội bộ dòng họ {activeClanName || ''}</span>
              </div>
            </div>
            <div className="chat-topbar-right">
              <span className="chat-turn-badge">{messages.length} lượt trao đổi</span>
            </div>
          </div>

          <div className="chat-messages-box">
            {messages.map((m) => (
              <div key={m.id} className={`chat-message-item ${m.sender}`}>
                <div className="chat-avatar">{m.sender === 'ai' ? 'AI' : 'Tôi'}</div>
                <div className={`chat-bubble ${m.isError ? 'error-bubble' : ''}`}>
                  {/* Subtle Header for AI bubbles */}
                  {m.sender === 'ai' && !m.isError && (
                    <div className="bubble-header-bar">
                      <span className="bubble-author-title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        Trợ lý Phả hệ
                      </span>
                      <span className="bubble-verified-tag">Dữ liệu nội bộ</span>
                    </div>
                  )}

                  {/* Clean text formatted without asterisks */}
                  {renderCleanFormattedText(m.text)}

                  {/* Person Candidates (Homonyms / Trùng tên) */}
                  {m.person_candidates && m.person_candidates.length > 0 && (
                    <div className="candidates-box">
                      <div className="candidates-title">
                        Vui lòng chọn đúng thành viên bạn muốn xem:
                      </div>
                      <div className="candidates-grid">
                        {m.person_candidates.map((cand) => (
                          <button
                            key={cand.person_id}
                            type="button"
                            className="candidate-btn"
                            onClick={() => handleSelectCandidate(cand)}
                            disabled={isThinking}
                          >
                            <span>
                              {cand.full_name} (Đời {cand.generation})
                            </span>
                            <span className="candidate-sub">
                              {cand.birth_year ? `Sinh ${cand.birth_year}` : ''}
                              {cand.death_year ? ` - Mất ${cand.death_year}` : (cand.is_alive ? ' (Còn sống)' : '')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sources Citations */}
                  {m.sources && m.sources.length > 0 && (
                    <div className="chat-sources-box">
                      <span className="sources-label">Nguồn phả hệ đã xác thực:</span>
                      <div className="sources-list">
                        {m.sources.map((s, idx) => (
                          <span key={idx} className="source-tag">
                            <strong>{s.full_name}</strong>
                            {s.role && <span className="source-role">({s.role})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Follow-up Questions under AI message */}
                  {m.suggested_questions && m.suggested_questions.length > 0 && (
                    <div className="inline-suggestions-box">
                      {m.suggested_questions.map((sug, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="inline-suggestion-btn"
                          onClick={() => handleSendMessage(sug)}
                          disabled={isThinking}
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  )}

                  <span className="chat-time">{m.timestamp}</span>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="chat-message-item ai">
                <div className="chat-avatar">AI</div>
                <div className="chat-bubble thinking">
                  <div className="thinking-dots-wave">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span>Trợ lý AI đang tra cứu dữ liệu gia phả & soạn thảo...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Container (Unified Floating Capsule Bar) */}
          <div className="chat-input-container">
            <form
              className="chat-capsule-bar"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <div className="chat-capsule-icon" title="Trợ lý AI Gia Phả">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                </svg>
              </div>
              <input
                type="text"
                className="chat-capsule-input"
                placeholder="Đặt câu hỏi về thủy tổ, cha mẹ, con cái, quan hệ họ hàng, thống kê..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                disabled={isThinking}
              />
              <button
                type="submit"
                className={`chat-capsule-btn ${inputQuery.trim() ? 'active' : ''}`}
                disabled={isThinking || !inputQuery.trim()}
                title={inputQuery.trim() ? "Nhấn Enter hoặc click để gửi câu hỏi" : "Nhập câu hỏi để gửi"}
              >
                <span>Gửi</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </form>
            <div className="chat-input-helper-bar">
              <span className="helper-hint">
                <kbd className="helper-kbd">Enter</kbd> gửi câu hỏi • Hỗ trợ câu hỏi tự do, quan hệ họ hàng và thống kê
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Suggested Categories & Query History */}
        <div className="ai-side-card">
          {/* Segmented Control Tabs */}
          <div className="side-tabs-header">
            <button
              type="button"
              className={`side-tab-btn ${activeSideTab === 'faq' ? 'active' : ''}`}
              onClick={() => setActiveSideTab('faq')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Gợi ý câu hỏi</span>
            </button>
            <button
              type="button"
              className={`side-tab-btn ${activeSideTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveSideTab('history')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Lịch sử tra</span>
              {queryHistory.length > 0 && (
                <span className="side-tab-count-badge">{queryHistory.length}</span>
              )}
            </button>
          </div>

          {activeSideTab === 'faq' ? (
            <div className="side-suggestions-group">
              <span className="side-group-badge blue">Thủy tổ & Quy mô gia tộc</span>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Cụ khởi tổ của dòng họ là ai?')}
                disabled={isThinking}
              >
                <span>Cụ khởi tổ của dòng họ là ai?</span>
                <span className="side-pill-arrow">→</span>
              </button>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Thống kê số lượng thành viên và số thế hệ của dòng họ?')}
                disabled={isThinking}
              >
                <span>Thống kê số lượng thành viên và số thế hệ?</span>
                <span className="side-pill-arrow">→</span>
              </button>

              <span className="side-group-badge purple">Thành viên & Quan hệ</span>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Thế hệ thứ 2 trong dòng họ gồm những ai?')}
                disabled={isThinking}
              >
                <span>Thế hệ thứ 2 trong dòng họ gồm những ai?</span>
                <span className="side-pill-arrow">→</span>
              </button>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Cách xưng hô giữa các nhánh họ hàng trong gia tộc?')}
                disabled={isThinking}
              >
                <span>Cách xưng hô giữa các nhánh họ hàng?</span>
                <span className="side-pill-arrow">→</span>
              </button>

              <span className="side-group-badge amber">Văn hóa & Đạo hiếu</span>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Ý nghĩa của truyền thống thờ cúng tổ tiên trong văn hóa Việt?')}
                disabled={isThinking}
              >
                <span>Ý nghĩa truyền thống thờ cúng tổ tiên?</span>
                <span className="side-pill-arrow">→</span>
              </button>
              <button
                type="button"
                className="side-pill-btn"
                onClick={() => handleSendMessage('Gợi ý một bài thơ hoặc lời chúc mừng thọ ông bà trang trọng?')}
                disabled={isThinking}
              >
                <span>Viết lời chúc mừng thọ ông bà trang trọng?</span>
                <span className="side-pill-arrow">→</span>
              </button>
            </div>
          ) : (
            <div className="side-history-group">
              <div className="history-group-header">
                <div className="history-header-title">
                  <span>Câu hỏi đã tra</span>
                  <span className="history-badge-count">{queryHistory.length}</span>
                </div>
                {queryHistory.length > 0 && (
                  <button
                    type="button"
                    className="history-clear-all-btn"
                    onClick={handleClearQueryHistory}
                    title="Xóa tất cả lịch sử tra cứu"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>Xóa hết</span>
                  </button>
                )}
              </div>

              {queryHistory.length === 0 ? (
                <div className="history-empty-state">
                  <div className="history-empty-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <p className="history-empty-title">Chưa có lịch sử</p>
                  <p className="history-empty-desc">
                    Các câu hỏi bạn gửi cho Trợ lý AI sẽ tự động được lưu tại đây để tiện xem lại hoặc tra cứu lại.
                  </p>
                </div>
              ) : (
                <div className="history-items-list">
                  {queryHistory.map((item) => (
                    <div key={item.id} className="history-item-card">
                      <button
                        type="button"
                        className="history-item-main"
                        onClick={() => handleSendMessage(item.query)}
                        disabled={isThinking}
                        title="Bấm để tra cứu lại câu hỏi này"
                      >
                        <div className="history-item-top">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="history-item-clock">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                          </svg>
                          <span className="history-item-time">{item.timestamp}</span>
                        </div>
                        <div className="history-item-query">{item.query}</div>
                      </button>
                      <button
                        type="button"
                        className="history-item-del-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteHistoryItem(item.id);
                        }}
                        title="Xóa câu hỏi này khỏi lịch sử"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="side-security-box">
            <div className="security-box-header">Bảo mật & Quyền riêng tư</div>
            <p className="security-box-text">
              Dữ liệu phả hệ được bảo vệ nghiêm ngặt: Chỉ những thông tin cá nhân được cấp quyền (AIConsent)
              mới được đưa vào ngữ cảnh xử lý. Người dùng có thể quản lý quyền tại mục Quyền riêng tư & AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClanAIAssistantModule;
