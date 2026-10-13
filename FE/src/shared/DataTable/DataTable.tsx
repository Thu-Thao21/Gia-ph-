import React from 'react';
import './DataTable.css';
import EmptyState from '../Feedback/EmptyState';
import LoadingState from '../Feedback/LoadingState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string | number;
}

export function DataTable<T>({ columns, data, isLoading, emptyMessage, keyExtractor }: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingState message="Đang tải dữ liệu..." />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message={emptyMessage || "Không có dữ liệu hiển thị."} />;
  }

  return (
    <div className="shared-table-container">
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={keyExtractor(item)}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(item) : (item as any)[col.key]}
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
