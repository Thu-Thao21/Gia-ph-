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
import './InLawMarriagesTab.css';

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

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'verified';
      case 'PENDING':
        return 'pending';
      case 'AWAITING_SPOUSE':
        return 'awaiting';
      default:
        return 'rejected';
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
        <div className={`inlaw-feedback-banner ${feedbackMsg.type}`}>
          {feedbackMsg.text}
        </div>
      )}

      {/* Invitations Section */}
      {invitations.length > 0 && (
        <div className="network-card inlaw-invitations-card">
          <h4 className="inlaw-invitations-title">
            Lời Mời Kết Nối Hôn Phối Liên Họ
          </h4>
          <p className="inlaw-invitations-desc">
            Quy trình kết nối: Người gửi lời mời &rarr; Đối phương xác nhận &rarr; Quản trị viên 2 dòng tộc thẩm định &rarr; Chính thức kết nối thông gia.
          </p>
          <div className="inlaw-invitations-list">
            {invitations.map((inv) => {
              const isAwaitingMe = inv.status === 'AWAITING_SPOUSE' && inv.can_respond;
              return (
                <div
                  key={inv.id}
                  className={`inlaw-invitation-item ${isAwaitingMe ? 'awaiting-me' : ''}`}
                >
                  <div className="inlaw-invitation-info">
                    <div className="inlaw-invitation-names">
                      {inv.sender_name || 'Thành viên'} ({inv.sender_clan_name || 'Dòng họ'})
                      <span className="inlaw-invitation-arrow">&harr;</span>
                      {inv.target_name || 'Thành viên'} ({inv.target_clan_name || 'Dòng họ'})
                    </div>
                    {inv.notes && (
                      <div className="inlaw-invitation-notes">
                        &ldquo;{inv.notes}&rdquo;
                      </div>
                    )}
                    <div className="inlaw-invitation-meta">
                      <span className={`inlaw-status-pill ${getStatusClass(inv.status)}`}>
                        {inv.status === 'AWAITING_SPOUSE'
                          ? (inv.can_respond ? 'Chờ bạn xác nhận' : 'Đang chờ đối phương xác nhận')
                          : inv.status === 'PENDING'
                          ? 'Chờ Trưởng tộc 2 họ xác minh'
                          : inv.status === 'VERIFIED'
                          ? 'Đã xác minh chính thức'
                          : 'Bị từ chối'}
                      </span>
                      <span className="inlaw-invitation-date">
                        {new Date(inv.created_at).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  {inv.can_respond && inv.status === 'AWAITING_SPOUSE' && (
                    <div className="inlaw-invitation-actions">
                      <button
                        type="button"
                        disabled={actionId === inv.id}
                        onClick={() => handleRespond(inv.id, 'ACCEPT')}
                        className="inlaw-btn-accept"
                      >
                        {actionId === inv.id ? 'Đang xử lý...' : 'Chấp nhận'}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === inv.id}
                        onClick={() => handleRespond(inv.id, 'REJECT')}
                        className="inlaw-btn-reject"
                      >
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
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
                    className="inlaw-btn-dual-lineage"
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
