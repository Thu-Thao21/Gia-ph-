import React, { useState } from 'react';

export const MaleAvatarSvg: React.FC<{ size?: number; className?: string }> = ({
  size = 36,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Nam"
    style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
  >
    <rect width="36" height="36" rx="18" fill="#DBEAFE" />
    <path
      d="M18 7C14.686 7 12 9.686 12 13C12 16.314 14.686 19 18 19C21.314 19 24 16.314 24 13C24 9.686 21.314 7 18 7Z"
      fill="#2563EB"
    />
    <path
      d="M8.5 29C8.5 24.3 12.8 21 18 21C23.2 21 27.5 24.3 27.5 29C27.5 29.55 27.05 30 26.5 30H9.5C8.95 30 8.5 29.55 8.5 29Z"
      fill="#2563EB"
    />
  </svg>
);

export const FemaleAvatarSvg: React.FC<{ size?: number; className?: string }> = ({
  size = 36,
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Nữ"
    style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
  >
    <rect width="36" height="36" rx="18" fill="#FCE7F3" />
    <path
      d="M18 7C14.686 7 12 9.686 12 13C12 16.314 14.686 19 18 19C21.314 19 24 16.314 24 13C24 9.686 21.314 7 18 7Z"
      fill="#DB2777"
    />
    <path
      d="M8.5 29C8.5 24.3 12.8 21 18 21C23.2 21 27.5 24.3 27.5 29C27.5 29.55 27.05 30 26.5 30H9.5C8.95 30 8.5 29.55 8.5 29Z"
      fill="#DB2777"
    />
    <path
      d="M11 13.5C11 10.5 14 7.5 18 7.5C22 7.5 25 10.5 25 13.5C25 14.5 24.5 15.5 24 16C23.5 14.5 21.5 13 18 13C14.5 13 12.5 14.5 12 16C11.5 15.5 11 14.5 11 13.5Z"
      fill="#BE185D"
    />
  </svg>
);

export interface GenderAvatarProps {
  avatarUrl?: string | null;
  gender?: string | null;
  name?: string;
  size?: number;
  className?: string;
  imgClassName?: string;
}

export const GenderAvatar: React.FC<GenderAvatarProps> = ({
  avatarUrl,
  gender,
  name = 'Thành viên',
  size = 36,
  className = '',
  imgClassName = '',
}) => {
  const [loadError, setLoadError] = useState(false);

  const cleanUrl = avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : null;
  const isFemale =
    gender && (gender.toLowerCase() === 'female' || gender.toLowerCase() === 'nu' || gender.toLowerCase() === 'nữ');

  if (cleanUrl && !loadError) {
    return (
      <img
        src={cleanUrl}
        alt={name}
        className={imgClassName}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
        onError={() => setLoadError(true)}
      />
    );
  }

  return isFemale ? (
    <FemaleAvatarSvg size={size} className={className} />
  ) : (
    <MaleAvatarSvg size={size} className={className} />
  );
};
