import React from 'react';
import './DataTable.css';
import EmptyState from '../Feedback/EmptyState';
import LoadingState from '../Feedback/LoadingState';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  /** Cột thao tác (nút bấm): trên mobile hiện ở cuối thẻ, không có nhãn. */
  isAction?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string | number;
  /** Trên mobile hiển thị mỗi hàng thành một thẻ (mặc định true). */
  mobileCard?: boolean;
}

export function DataTable<T>({ columns, data, isLoading, emptyMessage, keyExtractor, mobileCard = true }: DataTableProps<T>) {
  const isMobile = useIsMobile();

  if (isLoading) {
    return <LoadingState message="Đang tải dữ liệu..." />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message={emptyMessage || "Không có dữ liệu hiển thị."} />;
  }

  const renderCell = (col: Column<T>, item: T) => (col.render ? col.render(item) : (item as any)[col.key]);

  if (isMobile && mobileCard) {
    // Cột đầu tiên làm tiêu đề thẻ, các cột thường hiện "nhãn: giá trị", cột thao tác ở cuối
    const [titleCol, ...restCols] = columns;
    const fieldCols = restCols.filter((c) => !c.isAction);
    const actionCols = restCols.filter((c) => c.isAction);
    return (
      <div className="dt-card-list">
        {data.map((item) => (
          <div key={keyExtractor(item)} className="dt-card">
            {titleCol && <div className="dt-card-title">{renderCell(titleCol, item)}</div>}
            {fieldCols.map((col) => (
              <div key={col.key} className="dt-card-row">
                <span className="dt-card-label">{col.header}</span>
                <span className="dt-card-value">{renderCell(col, item)}</span>
              </div>
            ))}
            {actionCols.length > 0 && (
              <div className="dt-card-actions">
                {actionCols.map((col) => (
                  <React.Fragment key={col.key}>{renderCell(col, item)}</React.Fragment>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="shared-table-container">
      <div className="table-responsive">
        <table className="custom-table dt-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={keyExtractor(item)}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {renderCell(col, item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
