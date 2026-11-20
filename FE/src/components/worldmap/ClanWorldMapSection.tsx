import React from 'react';
import type { ClanLocation } from '../../types/location';
import { WorldMapView } from './WorldMapView';
import { useWorldMapPoints } from './useWorldMapPoints';
import type { BurialEntry } from './worldMapData';

export interface ClanWorldMapSectionProps {
  /** Địa điểm dòng họ đã tải từ API hiện có (đúng quyền người dùng). */
  locations: readonly ClanLocation[];
  loading?: boolean;
  /** Lớp mộ phần cả dòng họ — chưa có API nên hiện để trống; sau này chỉ cần truyền vào. */
  burials?: readonly BurialEntry[] | null;
}

/** Nối dữ liệu địa điểm + mộ phần vào WorldMapView (khối bản đồ đã tự có khung thẻ/tiêu đề/thống kê riêng). */
export const ClanWorldMapSection: React.FC<ClanWorldMapSectionProps> = ({ locations, loading, burials }) => {
  const { points, isDemo } = useWorldMapPoints({ locations, burials });

  return (
    <WorldMapView
      points={points}
      loading={loading || (isDemo && points.length === 0)}
      title={isDemo ? 'Bản đồ thế giới (dữ liệu minh họa ?demo=1)' : 'Bản đồ thế giới — nơi dòng họ có mặt'}
    />
  );
};

export default ClanWorldMapSection;
