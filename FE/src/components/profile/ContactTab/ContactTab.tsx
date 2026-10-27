import React from 'react';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './ContactTab.css';

export interface ContactTabProps {
  member: MemberDetail;
  isPrivate?: boolean;
  isSelf?: boolean;
}

export const ContactTab: React.FC<ContactTabProps> = ({ member, isPrivate = false, isSelf = false }) => {
  const contacts = member.contacts || [];

  const maskValue = (val: string, type: string) => {
    if (!isPrivate || isSelf) return val;
    if (type.toLowerCase() === 'phone') {
      return val.length > 4 ? val.substring(0, 3) + '****' + val.substring(val.length - 2) + ' (Đã ẩn bởi chủ tài khoản)' : '*** (Đã ẩn)';
    }
    if (type.toLowerCase() === 'email') {
      const parts = val.split('@');
      if (parts.length === 2) {
        return parts[0].substring(0, 2) + '***@' + parts[1] + ' (Đã ẩn bởi chủ tài khoản)';
      }
      return '***@email.com (Đã ẩn)';
    }
    return '*** (Thông tin riêng tư)';
  };

  return (
    <div className="contact-tab-wrapper">
      <div className="profile-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 className="profile-card-title" style={{ margin: 0 }}>Thông Tin Liên Hệ</h3>
          {isPrivate && (
            <span
              style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '6px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                fontWeight: 600,
              }}
            >
              Chế độ Riêng tư: Thông tin liên lạc được bảo vệ
            </span>
          )}
        </div>

        {contacts.length > 0 ? (
          <div className="contact-item-list">
            {contacts.map((c) => (
              <div key={c.id} className="contact-item-row">
                <div className="contact-item-content">
                  <div className="contact-type-label">
                    {c.contactType.toUpperCase()} {c.isPrimary && <span className="contact-primary-badge">(Chính)</span>}
                    {isPrivate && isSelf && (
                      <span style={{ marginLeft: '8px', color: '#b91c1c', fontSize: '11px' }}>
                        (Ẩn với thành viên khác)
                      </span>
                    )}
                  </div>
                  <div className="contact-value-text">
                    {maskValue(c.contactValue, c.contactType)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : member.contact ? (
          <div className="contact-item-list">
            {member.contact.phone && (
              <div className="contact-item-row">
                <div>
                  <div className="contact-type-label">
                    SỐ ĐIỆN THOẠI
                    {isPrivate && isSelf && (
                      <span style={{ marginLeft: '8px', color: '#b91c1c', fontSize: '11px' }}>
                        (Ẩn với thành viên khác)
                      </span>
                    )}
                  </div>
                  <div className="contact-value-text">
                    {maskValue(member.contact.phone, 'phone')}
                  </div>
                </div>
              </div>
            )}
            {member.contact.email && (
              <div className="contact-item-row">
                <div>
                  <div className="contact-type-label">
                    EMAIL
                    {isPrivate && isSelf && (
                      <span style={{ marginLeft: '8px', color: '#b91c1c', fontSize: '11px' }}>
                        (Ẩn với thành viên khác)
                      </span>
                    )}
                  </div>
                  <div className="contact-value-text">
                    {maskValue(member.contact.email, 'email')}
                  </div>
                </div>
              </div>
            )}
            {member.contact.address && (
              <div className="contact-item-row">
                <div>
                  <div className="contact-type-label">ĐỊA CHỈ THƯỜNG TRÚ</div>
                  <div className="contact-value-text">{member.contact.address}</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="profile-empty">Chưa có thông tin liên hệ nào.</div>
        )}
      </div>
    </div>
  );
};

export default ContactTab;
