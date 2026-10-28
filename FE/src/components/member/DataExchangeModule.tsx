import React, { useEffect, useRef, useState } from 'react';
import './SprintFeatures.css';

type ImportPhase = 'initial' | 'selected' | 'uploading' | 'processing' | 'success' | 'failed';
type ExportPhase = 'idle' | 'exporting' | 'success' | 'failed';
type ExportFormat = 'csv' | 'xls' | 'json' | 'pdf';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CSV_TEMPLATE = [
  ['Họ tên', 'Ngày sinh', 'Giới tính', 'Quan hệ', 'Chi nhánh'],
  ['Nguyễn Văn An', '1985-05-20', 'Nam', 'Con', 'Chi trưởng'],
];

const DATA_TYPES = [
  { value: 'members', label: 'Thành viên gia phả' },
  { value: 'tree', label: 'Cây và quan hệ gia phả' },
  { value: 'memorials', label: 'Ngày giỗ & tưởng niệm' },
  { value: 'events', label: 'Sự kiện gia tộc' },
  { value: 'fund', label: 'Giao dịch quỹ' },
  { value: 'archive', label: 'Danh mục tư liệu số' },
];

const FAMILIES = [
  { value: 'all', label: 'Toàn bộ dòng họ được phép' },
  { value: 'nguyen-ha-noi', label: 'Họ Nguyễn · Chi Hà Nội' },
  { value: 'nguyen-hai-duong', label: 'Họ Nguyễn · Chi Hải Dương' },
  { value: 'tran-thong-gia', label: 'Họ Trần · Thông gia' },
];

const IMPORT_PHASE_LABELS: Record<ImportPhase, string> = {
  initial: 'Chưa chọn tệp',
  selected: 'Đã chọn tệp',
  uploading: 'Đang tải lên',
  processing: 'Đang xử lý',
  success: 'Nhập thành công',
  failed: 'Không thể nhập',
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const getExtension = (name: string) => name.split('.').pop()?.toLowerCase() || '';

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
};

const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const buildSimplePdf = (lines: string[]) => {
  const asciiLines = lines.map((line) => line
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/([\\()])/g, '\\$1'));
  const content = [
    'BT',
    '/F1 12 Tf',
    '48 790 Td',
    '16 TL',
    ...asciiLines.map((line, index) => `${index === 0 ? '' : 'T* '}(${line}) Tj`),
    'ET',
  ].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];
  let documentContent = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(documentContent.length);
    documentContent += object;
  });
  const xrefOffset = documentContent.length;
  documentContent += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  documentContent += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  documentContent += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([documentContent], { type: 'application/pdf' });
};

export const DataExchangeModule: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importTimers = useRef<number[]>([]);
  const exportTimers = useRef<number[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [importPhase, setImportPhase] = useState<ImportPhase>('initial');
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [dataType, setDataType] = useState('members');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [familyScope, setFamilyScope] = useState('nguyen-ha-noi');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');

  const clearTimerList = (timerList: React.MutableRefObject<number[]>) => {
    timerList.current.forEach((timer) => window.clearTimeout(timer));
    timerList.current = [];
  };

  useEffect(() => () => {
    clearTimerList(importTimers);
    clearTimerList(exportTimers);
  }, []);

  const resetImport = () => {
    clearTimerList(importTimers);
    setSelectedFile(null);
    setPreview([]);
    setImportPhase('initial');
    setImportProgress(0);
    setImportMessage('');
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectFile = async (file?: File) => {
    setIsDragging(false);
    clearTimerList(importTimers);
    if (!file) return;

    const extension = getExtension(file.name);
    if (!['csv', 'xlsx', 'xls'].includes(extension)) {
      setSelectedFile(null);
      setPreview([]);
      setImportProgress(0);
      setImportPhase('failed');
      setImportMessage('Định dạng không hợp lệ. Vui lòng chọn tệp CSV, XLS hoặc XLSX.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setPreview([]);
      setImportProgress(0);
      setImportPhase('failed');
      setImportMessage(`Tệp ${formatBytes(file.size)} vượt quá giới hạn 10 MB.`);
      return;
    }

    setSelectedFile(file);
    setImportProgress(0);
    setImportPhase('selected');
    setImportMessage('Tệp đã sẵn sàng. Hãy kiểm tra thông tin và bản xem trước.');

    if (extension === 'csv') {
      try {
        const text = await file.text();
        const rows = text
          .split(/\r?\n/)
          .filter((row) => row.trim())
          .slice(0, 7)
          .map((row) => row.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')));
        setPreview(rows);
      } catch {
        setSelectedFile(null);
        setPreview([]);
        setImportPhase('failed');
        setImportMessage('Không thể đọc bản xem trước của tệp CSV.');
      }
    } else {
      setPreview([]);
    }
  };

  const startImport = () => {
    if (!selectedFile) {
      setImportPhase('failed');
      setImportMessage('Vui lòng chọn một tệp hợp lệ trước khi nhập.');
      return;
    }

    clearTimerList(importTimers);
    setImportPhase('uploading');
    setImportProgress(10);
    setImportMessage('Đang tải tệp lên vùng xử lý mô phỏng…');

    const schedule = (delay: number, callback: () => void) => {
      importTimers.current.push(window.setTimeout(callback, delay));
    };
    schedule(250, () => setImportProgress(32));
    schedule(520, () => setImportProgress(58));
    schedule(780, () => {
      setImportProgress(74);
      setImportPhase('processing');
      setImportMessage('Đang kiểm tra cột dữ liệu, định dạng ngày và quan hệ gia phả…');
    });
    schedule(1120, () => setImportProgress(90));
    schedule(1520, () => {
      setImportProgress(100);
      setImportPhase('success');
      setImportMessage('Đã mô phỏng nhập thành công 24 bản ghi; 24 hợp lệ, 0 lỗi.');
    });
  };

  const createExportDownload = () => {
    const dataLabel = DATA_TYPES.find((item) => item.value === dataType)?.label || dataType;
    const familyLabel = FAMILIES.find((item) => item.value === familyScope)?.label || familyScope;
    const rows = [
      ['Mã', 'Dữ liệu', 'Phạm vi', 'Ngày tạo'],
      ['MFG-001', dataLabel, familyLabel, new Date().toLocaleDateString('vi-VN')],
      ['MFG-002', 'Nguyễn Văn An', familyLabel, '20/05/1985'],
    ];
    const rangeLabel = dateFrom || dateTo ? `${dateFrom || 'đầu kỳ'} đến ${dateTo || 'hiện tại'}` : 'Toàn bộ thời gian';
    const baseName = `gia-pha-${dataType}-${new Date().toISOString().slice(0, 10)}`;

    if (exportFormat === 'json') {
      downloadBlob(new Blob([JSON.stringify({ dataType, family: familyLabel, range: rangeLabel, records: rows.slice(1) }, null, 2)], {
        type: 'application/json;charset=utf-8',
      }), `${baseName}.json`);
      return;
    }

    if (exportFormat === 'xls') {
      const table = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${table}</table></body></html>`;
      downloadBlob(new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${baseName}.xls`);
      return;
    }

    if (exportFormat === 'pdf') {
      downloadBlob(buildSimplePdf([
        'MFGMS-AI - BAO CAO XUAT DU LIEU',
        `Loai du lieu: ${dataLabel}`,
        `Pham vi: ${familyLabel}`,
        `Thoi gian: ${rangeLabel}`,
        'Ban xuat mo phong Frontend - khong su dung API.',
      ]), `${baseName}.pdf`);
      return;
    }

    const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), `${baseName}.csv`);
  };

  const startExport = () => {
    clearTimerList(exportTimers);
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setExportPhase('failed');
      setExportProgress(0);
      setExportMessage('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }

    setExportPhase('exporting');
    setExportProgress(12);
    setExportMessage('Đang tổng hợp dữ liệu theo phạm vi quyền riêng tư…');
    const schedule = (delay: number, callback: () => void) => {
      exportTimers.current.push(window.setTimeout(callback, delay));
    };
    schedule(260, () => setExportProgress(35));
    schedule(540, () => setExportProgress(62));
    schedule(820, () => {
      setExportProgress(84);
      setExportMessage('Đang đóng gói tệp tải xuống…');
    });
    schedule(1150, () => {
      try {
        createExportDownload();
        setExportProgress(100);
        setExportPhase('success');
        setExportMessage('Xuất dữ liệu thành công. Tệp đã được gửi tới thư mục tải xuống.');
      } catch {
        setExportProgress(0);
        setExportPhase('failed');
        setExportMessage('Không thể tạo tệp tải xuống. Vui lòng thử lại.');
      }
    });
  };

  const downloadTemplate = () => {
    const csv = CSV_TEMPLATE.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), 'mau-nhap-thanh-vien.csv');
  };

  const isImportBusy = importPhase === 'uploading' || importPhase === 'processing';

  return (
    <section className="sprint-feature-page data-exchange-page" aria-labelledby="data-exchange-title">
      <header className="sprint-feature-hero">
        <div>
          <span>QUẢN LÝ DÒNG HỌ</span>
          <h1 id="data-exchange-title">Nhập & xuất dữ liệu</h1>
          <p>Mô phỏng đầy đủ quy trình trao đổi dữ liệu mà không gọi API hoặc thay đổi cơ sở dữ liệu.</p>
        </div>
        <button type="button" className="hero-outline-button" onClick={downloadTemplate}>Tải mẫu CSV</button>
      </header>

      <div className="exchange-grid">
        <article className="sprint-card exchange-card" aria-labelledby="import-title">
          <div className="exchange-card-heading">
            <div>
              <span className="exchange-step">01</span>
              <div>
                <h2 id="import-title">Nhập dữ liệu</h2>
                <p>CSV, XLS hoặc XLSX · tối đa 10 MB</p>
              </div>
            </div>
            <span className={`exchange-status ${importPhase}`}>{IMPORT_PHASE_LABELS[importPhase]}</span>
          </div>

          <div
            className={`file-drop ${isDragging ? 'dragging' : ''} ${importPhase === 'failed' ? 'failed' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (!isImportBusy) setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!isImportBusy) void selectFile(event.dataTransfer.files?.[0]);
            }}
          >
            <span className="file-drop-icon" aria-hidden="true">⇧</span>
            <strong>{isDragging ? 'Thả tệp tại đây' : 'Kéo và thả tệp dữ liệu'}</strong>
            <span>hoặc</span>
            <label className="file-picker-button">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xls,.xlsx"
                disabled={isImportBusy}
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
              Chọn tệp từ thiết bị
            </label>
          </div>

          {selectedFile && (
            <div className="selected-file-card">
              <span className="selected-file-icon" aria-hidden="true">{getExtension(selectedFile.name) === 'csv' ? 'CSV' : 'XLS'}</span>
              <div>
                <strong>{selectedFile.name}</strong>
                <span>{selectedFile.type || `Tệp ${getExtension(selectedFile.name).toUpperCase()}`} · {formatBytes(selectedFile.size)}</span>
              </div>
              <button type="button" onClick={resetImport} disabled={isImportBusy} aria-label="Bỏ tệp đã chọn">×</button>
            </div>
          )}

          {importMessage && (
            <div className={`exchange-message ${importPhase}`} role={importPhase === 'failed' ? 'alert' : 'status'}>
              <span aria-hidden="true">{importPhase === 'failed' ? '!' : importPhase === 'success' ? '✓' : 'i'}</span>
              <span>{importMessage}</span>
            </div>
          )}

          {(isImportBusy || importPhase === 'success') && (
            <div className="exchange-progress" aria-label={`Tiến trình nhập ${importProgress}%`}>
              <div><span style={{ width: `${importProgress}%` }} /></div>
              <span>{importProgress}%</span>
            </div>
          )}

          {preview.length > 0 ? (
            <div className="exchange-preview">
              <div><strong>Xem trước dữ liệu</strong><span>Tối đa 6 dòng đầu</span></div>
              <div className="exchange-preview-scroll">
                <table>
                  <tbody>
                    {preview.map((row, rowIndex) => (
                      <tr key={`${rowIndex}-${row.join('-')}`}>
                        {row.map((cell, cellIndex) => rowIndex === 0
                          ? <th key={`${cellIndex}-${cell}`}>{cell || '—'}</th>
                          : <td key={`${cellIndex}-${cell}`}>{cell || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : selectedFile && ['xls', 'xlsx'].includes(getExtension(selectedFile.name)) ? (
            <div className="xlsx-preview-note">
              <strong>Tệp Excel sẵn sàng kiểm tra</strong>
              <span>Các cột dự kiến: Họ tên, Ngày sinh, Giới tính, Quan hệ, Chi nhánh.</span>
            </div>
          ) : null}

          <div className="exchange-card-actions">
            <button type="button" className="sprint-secondary" onClick={resetImport} disabled={importPhase === 'initial'}>
              {isImportBusy ? 'Hủy mô phỏng' : 'Làm lại'}
            </button>
            <button
              type="button"
              className="sprint-primary"
              disabled={!selectedFile || isImportBusy || importPhase === 'success'}
              onClick={startImport}
            >
              {isImportBusy ? 'Đang xử lý…' : 'Bắt đầu nhập'}
            </button>
          </div>
        </article>

        <article className="sprint-card exchange-card" aria-labelledby="export-title">
          <div className="exchange-card-heading">
            <div>
              <span className="exchange-step">02</span>
              <div>
                <h2 id="export-title">Xuất dữ liệu</h2>
                <p>Chọn nội dung, định dạng và phạm vi</p>
              </div>
            </div>
            <span className={`exchange-status ${exportPhase}`}>{exportPhase === 'exporting' ? 'Đang xuất' : exportPhase === 'success' ? 'Hoàn tất' : exportPhase === 'failed' ? 'Có lỗi' : 'Sẵn sàng'}</span>
          </div>

          <div className="export-form-grid">
            <label className="exchange-field">
              <span>Loại dữ liệu <b>*</b></span>
              <select value={dataType} onChange={(event) => setDataType(event.target.value)} disabled={exportPhase === 'exporting'}>
                {DATA_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="exchange-field">
              <span>Định dạng <b>*</b></span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)} disabled={exportPhase === 'exporting'}>
                <option value="csv">CSV (.csv)</option>
                <option value="xls">Excel (.xls)</option>
                <option value="json">JSON (.json)</option>
                <option value="pdf">PDF (.pdf)</option>
              </select>
            </label>
            <label className="exchange-field export-family-field">
              <span>Dòng họ / cây gia phả <b>*</b></span>
              <select value={familyScope} onChange={(event) => setFamilyScope(event.target.value)} disabled={exportPhase === 'exporting'}>
                {FAMILIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="exchange-field">
              <span>Từ ngày</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} disabled={exportPhase === 'exporting'} />
            </label>
            <label className="exchange-field">
              <span>Đến ngày</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} disabled={exportPhase === 'exporting'} />
            </label>
          </div>

          <div className="export-scope-summary">
            
            <p><strong>Tự động áp dụng quyền dữ liệu</strong> Tệp chỉ chứa những trường mà vai trò hiện tại được phép xem.</p>
          </div>

          {exportMessage && (
            <div className={`exchange-message ${exportPhase}`} role={exportPhase === 'failed' ? 'alert' : 'status'}>
              <span aria-hidden="true">{exportPhase === 'failed' ? '!' : exportPhase === 'success' ? '✓' : 'i'}</span>
              <span>{exportMessage}</span>
            </div>
          )}

          {(exportPhase === 'exporting' || exportPhase === 'success') && (
            <div className="exchange-progress" aria-label={`Tiến trình xuất ${exportProgress}%`}>
              <div><span style={{ width: `${exportProgress}%` }} /></div>
              <span>{exportProgress}%</span>
            </div>
          )}

          <div className="exchange-card-actions">
            <button
              type="button"
              className="sprint-secondary"
              disabled={exportPhase === 'exporting'}
              onClick={() => {
                clearTimerList(exportTimers);
                setDateFrom('');
                setDateTo('');
                setDataType('members');
                setExportFormat('csv');
                setFamilyScope('nguyen-ha-noi');
                setExportPhase('idle');
                setExportProgress(0);
                setExportMessage('');
              }}
            >
              Đặt lại
            </button>
            <button type="button" className="sprint-primary" disabled={exportPhase === 'exporting'} onClick={startExport}>
              {exportPhase === 'exporting' ? 'Đang tạo tệp…' : 'Xuất & tải xuống'}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
};

export default DataExchangeModule;
