import React, { useEffect, useState } from 'react';
import { fetchInLawMarriages } from '../../../services/network.service';
import type { InLawMarriage } from '../../../types/network';
import { EmptyState } from '../../../shared/Feedback/EmptyState';
import { LoadingState } from '../../../shared/Feedback/LoadingState';
import '../Network.css';
import { DualLineageModal } from '../DualLineageModal';

export const InLawMarriagesTab: React.FC = () => {
  const [marriages, setMarriages] = useState<InLawMarriage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLineagePersonId, setSelectedLineagePersonId] = useState<string | null>(null);

  useEffect(() => {
    fetchInLawMarriages().then((data) => {
      setMarriages(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="network-layout">
        <div className="network-card">
          <LoadingState
            message="Đang trích xuất danh sách Dâu & Rể liên họ..."
            subMessage="Đang truy vấn các mối quan hệ hôn phối kết nối giữa các dòng họ trong hệ thống."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="network-layout">
      <div className="network-card">
        <h3 className="network-card-title">Dâu & Rể Liên Họ</h3>
        <p className="network-card-subtitle">
          Danh sách các cuộc hôn nhân kết nối giữa hai dòng họ khác nhau, tạo nên mạng lưới thông gia.
        </p>
        {marriages.length > 0 ? (
          <div className="network-marriage-list">
            {marriages.map((m) => (
              <div key={m.id} className="network-marriage-row">
                <div className="network-marriage-person">
                  <span className="network-marriage-avatar male">
                    {m.husbandName ? m.husbandName.charAt(0).toUpperCase() : 'N'}
                  </span>
                  <div className="network-marriage-name">{m.husbandName}</div>
                  <div className="network-marriage-family">{m.husbandFamily}</div>
                </div>

                <div className="network-marriage-center-col">
                  <div className="network-marriage-link-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="network-marriage-date">
                    {m.marriageDate || 'Chưa rõ ngày'}
                  </div>
                  {m.notes && <div className="network-marriage-notes">{m.notes}</div>}
                  <button
                    type="button"
                    onClick={() => setSelectedLineagePersonId(m.husbandPersonId || m.wifePersonId || m.id)}
                    style={{
                      marginTop: '8px',
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      color: '#6d28d9',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Xem 2-3 đời Bên Nội / Bên Ngoại
                  </button>
                </div>

                <div className="network-marriage-person">
                  <span className="network-marriage-avatar female">
                    {m.wifeName ? m.wifeName.charAt(0).toUpperCase() : 'N'}
                  </span>
                  <div className="network-marriage-name">{m.wifeName}</div>
                  <div className="network-marriage-family">{m.wifeFamily}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            variant="tree"
            title="Chưa ghi nhận mối liên kết Dâu & Rể liên họ"
            subMessage="Khi có các cuộc hôn nhân được thiết lập giữa thành viên dòng họ của bạn và các dòng họ khác, danh sách sẽ hiển thị trang trọng tại đây."
          />
        )}
      </div>
      {selectedLineagePersonId && (
        <DualLineageModal
          personId={selectedLineagePersonId}
          onClose={() => setSelectedLineagePersonId(null)}
        />
      )}
    </div>
  );
};

export default InLawMarriagesTab;
