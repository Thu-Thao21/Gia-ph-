import './WorshipSpacePage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const WorshipSpacePage: React.FC = () => {
  const [isWorshipMode, setIsWorshipMode] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleAction = (action: string) => {
    setActiveAction(action);
    setTimeout(() => {
      setActiveAction(null);
    }, 3000);
  };

  const headerActions = (
    <button className="worship-premium-btn admin-btn-primary bg-blue-600 hover:bg-blue-700 border-blue-600">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
      Đăng ký Gói Premium
    </button>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Phòng Thờ Số (Digital Worship Space)</h2>
          <p className="admin-account-subtitle">Không gian tâm linh kỹ thuật số giúp con cháu phương xa thắp hương, dâng lễ trực tuyến.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>
      
      {!isWorshipMode ? (
        <div className="worship-hero-container">
          <div className="worship-hero-icon-wrapper">
            <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13M10 10h4v4h-4v-4z" />
            </svg>
          </div>
          <h2 className="worship-hero-title">Không gian Thờ cúng 3D Interactive</h2>
          <p className="worship-hero-desc">
            Tính năng này cho phép giả lập một không gian từ đường 3D, nơi các thành viên có thể thực hiện nghi thức tâm linh, đọc văn khấn, thắp nhang ảo và nghe kinh/nhạc thiền.
          </p>
          <button className="worship-hero-btn admin-btn-primary text-lg px-8 py-3 bg-blue-600 hover:bg-blue-700 border-blue-600 shadow-lg shadow-yellow-600/20" onClick={() => setIsWorshipMode(true)}>
            Mở giao diện Phòng thờ ảo
          </button>
        </div>
      ) : (
        <div className="worship-room-container flex-1 bg-slate-900 rounded-xl overflow-hidden relative flex flex-col shadow-2xl animate-fade-in border border-slate-800">
          {/* Header of Room */}
          <div className="worship-room-header">
            <div className="text-white">
              <h3 className="worship-room-title">Từ Đường Nguyễn Đại Tôn</h3>
              <p className="worship-room-subtitle">Đang có 12 người trực tuyến dâng hương</p>
            </div>
            <button className="worship-room-exit-btn" onClick={() => setIsWorshipMode(false)}>
              Thoát phòng thờ
            </button>
          </div>

          {/* Main 3D Scene Mock */}
          <div className="worship-room-scene">
            
            {/* Altar Mock */}
            <div className="worship-altar-container">
              {/* Hoành phi */}
              <div className="worship-altar-banner">
                <span className="worship-altar-banner-text">德 流 光</span>
              </div>
              
              {/* Bàn thờ */}
              <div className="worship-altar-table">
                
                {/* Lư hương */}
                <div className="worship-incense-bowl">
                  <div className="worship-incense-ash"></div>
                  {/* Nhang */}
                  {activeAction === 'incense' && (
                    <div className="worship-incense-sticks absolute -top-16 flex gap-1 animate-fade-in">
                      <div className="worship-incense-stick-1"></div>
                      <div className="worship-incense-stick-2"></div>
                      <div className="worship-incense-stick-1"></div>
                      {/* Khói */}
                      <div className="worship-incense-smoke absolute -top-12 -left-4 text-white/50 text-4xl animate-bounce">🌫️</div>
                    </div>
                  )}
                </div>

                {/* Trái cây */}
                <div className="worship-fruit-tray">
                  {activeAction === 'fruit' && <span className="absolute -top-8 text-3xl animate-bounce">🍎🍊🍌</span>}
                </div>

                {/* Hoa */}
                <div className="worship-flower-vase">
                  {activeAction === 'flower' && <span className="absolute -top-12 text-4xl animate-bounce">💐</span>}
                </div>

                {/* Đèn cầy */}
                <div className="worship-candle worship-candle-left">
                  <div className="worship-candle-flame w-2 h-4 bg-yellow-300 rounded-full -mt-2 shadow-[0_0_15px_yellow] animate-pulse"></div>
                </div>
                <div className="worship-candle worship-candle-right">
                  <div className="worship-candle-flame w-2 h-4 bg-yellow-300 rounded-full -mt-2 shadow-[0_0_15px_yellow] animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Notification */}
            {activeAction && (
              <div className="worship-notification absolute top-24 left-1/2 -translate-x-1/2 bg-yellow-900/80 border border-blue-600 text-yellow-100 px-6 py-2 rounded-full backdrop-blur-md animate-fade-in font-medium shadow-xl">
                {activeAction === 'incense' && 'Bạn đã dâng 3 nén nhang thành tâm.'}
                {activeAction === 'flower' && 'Bạn đã dâng lẵng hoa tươi.'}
                {activeAction === 'fruit' && 'Bạn đã dâng mâm ngũ quả.'}
                {activeAction === 'pray' && 'Bạn đang đọc văn khấn...'}
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="worship-toolbar">
            <button 
              className={`worship-toolbar-btn ${activeAction === 'incense' ? 'worship-toolbar-btn-active' : 'worship-toolbar-btn-inactive'}`}
              onClick={() => handleAction('incense')}
            >
              <span className="text-2xl">🥢</span>
              <span className="text-xs font-medium">Thắp hương</span>
            </button>
            <button 
              className={`worship-toolbar-btn ${activeAction === 'flower' ? 'worship-toolbar-btn-active' : 'worship-toolbar-btn-inactive'}`}
              onClick={() => handleAction('flower')}
            >
              <span className="text-2xl">💐</span>
              <span className="text-xs font-medium">Dâng hoa</span>
            </button>
            <button 
              className={`worship-toolbar-btn ${activeAction === 'fruit' ? 'worship-toolbar-btn-active' : 'worship-toolbar-btn-inactive'}`}
              onClick={() => handleAction('fruit')}
            >
              <span className="text-2xl">🍎</span>
              <span className="text-xs font-medium">Dâng quả</span>
            </button>
            <div className="worship-toolbar-divider"></div>
            <button 
              className={`worship-toolbar-btn ${activeAction === 'pray' ? 'worship-toolbar-btn-active' : 'worship-toolbar-btn-inactive'}`}
              onClick={() => handleAction('pray')}
            >
              <span className="text-white0">🙏</span>
              <span className="text-white1">Khấn vái</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorshipSpacePage;
