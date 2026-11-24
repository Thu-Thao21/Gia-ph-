import React from 'react';
import { MAPTILER_HOME_URL, MAPTILER_LOGO_URL, type Basemap } from './mapStyle';

/**
 * Logo MapTiler — điều khoản MapTiler yêu cầu với tài khoản Free (xem mapStyle.ts). Chỉ hiện khi đang dùng nền
 * MapTiler; đặt góc dưới-trái (attribution ở góc dưới-phải). Cha phải có position: relative.
 */
export const MapTilerLogo: React.FC<{ basemap: Basemap }> = ({ basemap }) => {
  if (basemap.provider !== 'maptiler') return null;
  return (
    <a
      className="wm-maptiler-logo"
      href={MAPTILER_HOME_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="MapTiler"
    >
      <img src={MAPTILER_LOGO_URL} alt="MapTiler" width={67} height={20} />
    </a>
  );
};

export default MapTilerLogo;
