import React, { useEffect, useState } from 'react';
import {
  fetchInLawMarriages,
  fetchMyMarriageInvitations,
  respondMarriageInvitation,
} from '../../../services/network.service';
import type { InLawMarriage, MarriageInvitationItem } from '../../../types/network';
import { EmptyState } from '../../../shared/Feedback/EmptyState';
import { LoadingState } from '../../../shared/Feedback/LoadingState';
import '../Network.css';
import { DualLineageModal } from '../DualLineageModal';

export const InLawMarriagesTab: React.FC = () => {
  const [marriages, setMarriages] = useState<InLawMarriage[]>([]);
  const [invitations, setInvitations] = useState<MarriageInvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedLineagePersonId, setSelectedLineagePersonId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [mArr, invArr] = await Promise.all([
        fetchInLawMarriages(),
        fetchMyMarriageInvitations(),
      ]);
      setMarriages(mArr);
      setInvitations(invArr);
    } catch (err) {
      console.error('Error loading in-law marriages / invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRespond = async (mappingId: string, action: 'ACCEPT' | 'REJECT') => {
    setActionId(mappingId);
    setFeedbackMsg(null);
    try {
      await respondMarriageInvitation(mappingId, action);
      setFeedbackMsg({
        type: 'success',
        text: action === 'ACCEPT'
          ? 'Đã xác nhận kết nối hôn phối! Lời mời đã được chuyển tới Trưởng tộc 2 họ xét duyệt.'
          : 'Đã từ chối lời mời kết nối hôn phối.',
      });
      await loadData();
    } catch (err: any) {
      console.error('Respond invitation error:', err);
      const detail = err?.response?.data?.detail || 'Thao tác không thành công. Vui lòng thử lại sau.';
      setFeedbackMsg({ type: 'error', text: detail });
    } finally {
      setActionId(null);
    }
  };


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
      {feedbackMsg && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '16px',
            borderRadius: '8px',
            background: feedbackMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: feedbackMsg.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Invitations Section */}
      {invitations.length > 0 && (
        <div className="network-card" style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
            Lời Mời Kết Nối Hôn Phối Liên Họ
          </h4>
          <p style={{ margin: '0 0 14px 0', fontSize: '12.5px', color: '#64748b' }}>
            Quy trình kết nối: Người gửi lời mời &rarr; Đối phương xác nhận &rarr; Quản trị viên 2 dòng tộc thẩm định &rarr; Chính thức kết nối thông gia.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {invitations.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  background: inv.status === 'AWAITING_SPOUSE' && inv.can_respond ? '#eff6ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>
                    {inv.sender_name || 'Thành viên'} ({inv.sender_clan_name || 'Dòng họ'})
                    <span style={{ margin: '0 8px', color: '#94a3b8' }}>&harr;</span>
                    {inv.target_name || 'Thành viên'} ({inv.target_clan_name || 'Dòng họ'})
                  </div>
                  {inv.notes && (
                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                      &ldquo;{inv.notes}&rdquo;
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        background:
                          inv.status === 'VERIFIED' ? '#f0fdf4' :
                          inv.status === 'PENDING' ? '#eff6ff' :
                          inv.status === 'AWAITING_SPOUSE' ? '#fef3c7' : '#fef2f2',
                        color:
                          inv.status === 'VERIFIED' ? '#166534' :
                          inv.status === 'PENDING' ? '#1d4ed8' :
                          inv.status === 'AWAITING_SPOUSE' ? '#b45309' : '#991b1b',
                      }}
                    >
                      {inv.status === 'AWAITING_SPOUSE'
                        ? (inv.can_respond ? 'Chờ bạn xác nhận' : 'Đang chờ đối phương xác nhận')
                        : inv.status === 'PENDING'
                        ? 'Chờ Trưởng tộc 2 họ xác minh'
                        : inv.status === 'VERIFIED'
                        ? 'Đã xác minh chính thức'
                        : 'Bị từ chối'}
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>

                {inv.can_respond && inv.status === 'AWAITING_SPOUSE' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      disabled={actionId === inv.id}
                      onClick={() => handleRespond(inv.id, 'ACCEPT')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: actionId === inv.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionId === inv.id ? 'Đang xử lý...' : 'Chấp nhận'}
                    </button>
                    <button
                      type="button"
                      disabled={actionId === inv.id}
                      onClick={() => handleRespond(inv.id, 'REJECT')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        background: '#ffffff',
                        color: '#dc2626',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: actionId === inv.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Từ chối
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
