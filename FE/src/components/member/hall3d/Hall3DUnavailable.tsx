import React from 'react';
import { formatSolarDate } from './lunarCalendar';

/**
 * Thay cho khung 3D khi thiết bị không có WebGL hoặc cảnh 3D bị lỗi lúc chạy.
 * Chỉ một thông báo ngắn kèm danh sách tên và ngày mất dạng chữ (không dựng lại bàn thờ 2D).
 */
export const Hall3DUnavailable: React.FC<{
  items: ReadonlyArray<{ id: string; name: string; deathDate?: string | null }>;
}> = ({ items }) => (
  <div className="hall3d-unsupported" role="status">
    <strong>Thiết bị của bạn chưa hỗ trợ hiển thị 3D.</strong>
    <p>Vui lòng dùng trình duyệt mới hơn để xem phòng thờ 3D.</p>
    {items.length > 0 && (
      <ul aria-label="Danh sách tiền nhân">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <small>Mất: {formatSolarDate(item.deathDate) || 'chưa rõ'}</small>
          </li>
        ))}
      </ul>
    )}
  </div>
);
