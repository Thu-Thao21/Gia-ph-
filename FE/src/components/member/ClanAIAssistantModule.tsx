import React, { useState } from 'react';
import './ClanAIAssistantModule.css';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  citations?: Array<{ title: string; source: string }>;
}

export const ClanAIAssistantModule: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-01',
      sender: 'ai',
      text: 'Đây là bản minh họa giao diện Trợ lý AI. Câu trả lời hiện được tạo từ kịch bản mẫu, chưa tra cứu dữ liệu gia phả thật.',
      timestamp: '12:00',
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const sampleSuggestions = [
    'Cho tôi biết nguồn gốc khởi tổ của dòng họ Nguyễn Chi 1?',
    'Số lượng thành viên nam/nữ thuộc thế hệ thứ 4 là bao nhiêu?',
    'Trong dòng họ có bao nhiêu người đỗ thạc sĩ/tiến sĩ?',
    'Những sự kiện giỗ tổ quan trọng diễn ra trong quý này?',
  ];

  const handleSend = (queryToSend?: string) => {
    const text = queryToSend || inputQuery;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryToSend) setInputQuery('');
    setIsThinking(true);

    // Frontend-only scripted response; no model or family data is queried.
    setTimeout(() => {
      let aiText = '';
      const citations: Array<{ title: string; source: string }> = [];

      if (text.includes('khởi tổ') || text.includes('nguồn gốc')) {
        aiText = 'Bản xem trước chưa thể xác minh khởi tổ hoặc nguồn gốc. Khi kết nối AI và tư liệu gia phả, câu trả lời sẽ cần dẫn nguồn thật.';
      } else if (text.includes('thế hệ') || text.includes('nam/nữ')) {
        aiText = 'Bản xem trước chưa tính thống kê từ dữ liệu gia phả. Khi có backend, thống kê sẽ lấy dữ liệu trong phạm vi quyền của người hỏi.';
      } else {
        aiText =
          'Bản xem trước chưa kết nối dịch vụ AI hoặc dữ liệu gia phả. Đây là câu trả lời mẫu để kiểm tra giao diện hội thoại.';
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        citations,
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 1200);
  };

  return (
    <div className="ai-container">
      <div className="ai-header">
        <div>
          <h2 className="ai-title">Trợ Lý AI Gia Phả & Thống Kê Gợi Ý</h2>
          <p className="ai-subtitle">
            Bản xem trước giao diện. Phản hồi và thống kê bên dưới là dữ liệu minh họa, chưa kết nối AI.
          </p>
        </div>
      </div>

      <div className="ai-layout-grid">
        {/* Left Column: Chat Assistant */}
        <div className="chat-card">
          <div className="chat-messages-box">
            {messages.map((m) => (
              <div key={m.id} className={`chat-message-item ${m.sender}`}>
                <div className="chat-avatar">{m.sender === 'ai' ? 'AI' : 'Bạn'}</div>
                <div className="chat-bubble">
                  <div className="chat-text">{m.text}</div>

                  {m.citations && m.citations.length > 0 && (
                    <div className="chat-citations">
                      <span className="citation-label">Trích dẫn nguồn liên quan:</span>
                      {m.citations.map((c, idx) => (
                        <div key={idx} className="citation-item">
                          <strong>{c.title}</strong> — {c.source}
                        </div>
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
                  <span className="dot-pulse">Đang tạo phản hồi mẫu...</span>
                </div>
              </div>
            )}
          </div>

          <form
            className="chat-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              className="chat-input"
              placeholder="Đặt câu hỏi về dòng họ, thủy tổ, ngày giỗ, thống kê..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isThinking}
            />
            <button type="submit" className="chat-send-btn" disabled={isThinking}>
              Gửi ➔
            </button>
          </form>
        </div>

        {/* Right Column: AI Stats & Suggestions (FR-ME-32) */}
        <div className="ai-stats-card">
          <h3 className="ai-side-title">Gợi Ý & Thống Kê AI (FR-ME-32)</h3>

          <div className="suggestions-box">
            <span className="suggestions-label">Câu hỏi gợi ý thường gặp:</span>
            <div className="suggestions-list">
              {sampleSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="suggestion-pill"
                  onClick={() => handleSend(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <div className="stats-highlight-box">
            <h4 className="stats-box-title">Đặc điểm nổi bật gia tộc</h4>
            <ul className="stats-list">
              <li>• <strong>Cơ cấu thế hệ:</strong> Dữ liệu minh họa, chưa tính từ gia phả.</li>
              <li>• <strong>Phân bố địa lý:</strong> Sẽ hiển thị khi kết nối nguồn dữ liệu.</li>
              <li>• <strong>Trình độ học vấn:</strong> Sẽ hiển thị khi kết nối nguồn dữ liệu.</li>
            </ul>
          </div>

          <div className="ai-package-note">
            ℹ️ Chưa kiểm tra gói AI, quyền dữ liệu hoặc đồng ý sử dụng AI ở phía máy chủ.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClanAIAssistantModule;
