import React from 'react';
import type { MemberDetail } from '../../../types/member';
import '../Profile.css';
import './PhotosTab.css';

export interface PhotosTabProps {
  member: MemberDetail;
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ member }) => {
  const mediaList = member.media || [];
  const galleryList = member.galleryPhotos || [];

  const photos = [
    ...mediaList.map((m) => ({ url: m.mediaUrl, caption: m.caption })),
    ...galleryList,
  ];

  return (
    <div className="photos-tab-wrapper">
      <div className="profile-card">
        <h3 className="profile-card-title">Thư Viện Hình Ảnh Gia Tộc</h3>
        {photos.length > 0 ? (
          <div className="profile-photo-grid">
            {photos.map((p, idx) => (
              <div key={idx} className="profile-photo-item">
                <img src={p.url} alt={p.caption || 'Ảnh gia tộc'} className="profile-photo-img" />
                {p.caption && <div className="profile-photo-caption">{p.caption}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty">Chưa có hình ảnh nào trong thư viện của thành viên.</div>
        )}
      </div>
    </div>
  );
};

export default PhotosTab;
