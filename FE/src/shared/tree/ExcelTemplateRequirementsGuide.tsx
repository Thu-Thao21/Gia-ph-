import React, { useState } from 'react';
import './ExcelTemplateRequirementsGuide.css';

export interface ExcelTemplateRequirementsGuideProps {
  onDownloadTemplate?: () => void;
  defaultExpanded?: boolean;
}

export const ExcelTemplateRequirementsGuide: React.FC<ExcelTemplateRequirementsGuideProps> = ({
  onDownloadTemplate,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'sheets' | 'rules' | 'formats' | 'sample'>('sheets');

  return (
    <div className="fa-excel-guide-container">
      {/* Header & Toggle */}
      <div className="fa-excel-guide-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="fa-excel-guide-title-left">
          <div className="fa-excel-guide-icon-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3>
            Yêu cầu & Quy chuẩn file Excel mẫu (.xlsx)
            <span className="fa-excel-guide-pill-tag">Chuẩn 4 Sheets</span>
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onDownloadTemplate && (
            <button
              type="button"
              className="fa-guide-tag-optional"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadTemplate();
              }}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '4px 10px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Tải file mẫu
            </button>
          )}

          <div className="fa-excel-guide-toggle-action">
            {isExpanded ? (
              <>
                Thu gọn
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </>
            ) : (
              <>
                Xem chi tiết
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <>
          {/* Tabs Bar */}
          <div className="fa-excel-guide-tabs-bar">
            <button
              type="button"
              className={`fa-excel-guide-tab ${activeTab === 'sheets' ? 'active' : ''}`}
              onClick={() => setActiveTab('sheets')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              1. Cấu trúc 4 Sheets
            </button>

            <button
              type="button"
              className={`fa-excel-guide-tab ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              2. 5 Quy tắc Logic bắt buộc
            </button>

            <button
              type="button"
              className={`fa-excel-guide-tab ${activeTab === 'formats' ? 'active' : ''}`}
              onClick={() => setActiveTab('formats')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              3. Định dạng dữ liệu
            </button>

            <button
              type="button"
              className={`fa-excel-guide-tab ${activeTab === 'sample' ? 'active' : ''}`}
              onClick={() => setActiveTab('sample')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              4. Dữ liệu mẫu minh họa
            </button>
          </div>

          {/* Tab Body */}
          <div className="fa-excel-guide-tab-body">
            {/* TAB 1: SHEETS STRUCTURE */}
            {activeTab === 'sheets' && (
              <div className="fa-guide-sheets-grid">
                {/* Sheet 1 */}
                <div className="fa-guide-sheet-card">
                  <div className="fa-guide-sheet-card-header">
                    <span className="fa-guide-sheet-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      Sheet 1: THÀNH VIÊN
                    </span>
                    <span className="fa-guide-sheet-desc">Danh sách toàn bộ nhân khẩu phả hệ cần nạp</span>
                  </div>
                  <div className="fa-guide-table-responsive">
                    <table className="fa-guide-spec-table">
                      <thead>
                        <tr>
                          <th>Tên cột (Header)</th>
                          <th>Tính chất</th>
                          <th>Kiểu dữ liệu</th>
                          <th>Mô tả & Quy định</th>
                          <th>Ví dụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="fa-guide-code-cell">id_tam</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Ký tự/Số</td>
                          <td>Mã định danh tạm thời duy nhất trong file để liên kết quan hệ</td>
                          <td><code>P01</code>, <code>1</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">ho_ten</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Văn bản</td>
                          <td>Họ và tên đầy đủ thành viên</td>
                          <td>Dương Tự Cường</td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">gioi_tinh</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>NAM / NU</td>
                          <td>Chỉ chấp nhận <code>NAM</code> hoặc <code>NU</code> (không phân biệt hoa/thường)</td>
                          <td><code>NAM</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">doi_thu</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Số nguyên &ge; 1</td>
                          <td>Thế hệ trong dòng tộc. Cụ Thủy Tổ bắt đầu là Đời 1</td>
                          <td><code>1</code>, <code>2</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">con_song</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>DUNG / SAI</td>
                          <td><code>DUNG</code> (hoặc 1) nếu còn sống; <code>SAI</code> (hoặc 0) nếu đã mất</td>
                          <td><code>DUNG</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">ngay_sinh</span></td>
                          <td><span className="fa-guide-tag-optional">Tùy chọn</span></td>
                          <td>Ngày / Năm</td>
                          <td>Định dạng chuẩn <code>YYYY-MM-DD</code> hoặc chỉ ghi năm <code>YYYY</code></td>
                          <td><code>1945-08-19</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">ngay_mat</span></td>
                          <td><span className="fa-guide-tag-optional">Tùy chọn</span></td>
                          <td>Ngày / Năm</td>
                          <td>Bắt buộc để trống nếu <code>con_song = DUNG</code>. Điền khi đã mất</td>
                          <td><code>2010</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">chi_nhanh_tam</span></td>
                          <td><span className="fa-guide-tag-optional">Tùy chọn</span></td>
                          <td>Ký tự</td>
                          <td>Mã chi nhánh (phải khớp với <code>ma_chi_tam</code> tại Sheet CHI NHÁNH)</td>
                          <td><code>CHI_TRUONG</code></td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">tieu_su</span></td>
                          <td><span className="fa-guide-tag-optional">Tùy chọn</span></td>
                          <td>Văn bản</td>
                          <td>Tiểu sử, công đức hoặc ghi chú phả ký</td>
                          <td>Đỗ Tiến sĩ khoa Ất Mùi</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sheet 2 */}
                <div className="fa-guide-sheet-card">
                  <div className="fa-guide-sheet-card-header">
                    <span className="fa-guide-sheet-name">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      Sheet 2: QUAN HỆ
                    </span>
                    <span className="fa-guide-sheet-desc">Kết nối huyết thống và hôn nhân giữa các thành viên</span>
                  </div>
                  <div className="fa-guide-table-responsive">
                    <table className="fa-guide-spec-table">
                      <thead>
                        <tr>
                          <th>Tên cột (Header)</th>
                          <th>Tính chất</th>
                          <th>Mô tả quy chuẩn</th>
                          <th>Quy tắc thế hệ & giới tính</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><span className="fa-guide-code-cell">id_tam_nguoi_chinh</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Mã tạm của Cha / Mẹ hoặc Chồng</td>
                          <td>Phải tồn tại ở Sheet THÀNH VIÊN</td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">id_tam_nguoi_lien_quan</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Mã tạm của Con hoặc Vợ</td>
                          <td>Phải tồn tại ở Sheet THÀNH VIÊN</td>
                        </tr>
                        <tr>
                          <td><span className="fa-guide-code-cell">loai_quan_he</span></td>
                          <td><span className="fa-guide-tag-required">Bắt buộc</span></td>
                          <td>Chỉ chấp nhận: <code>CHA_CON</code>, <code>ME_CON</code>, <code>VO_CHONG</code></td>
                          <td>
                            • <code>CHA_CON</code>: Người chính là NAM (Đời N) &rarr; Con (Đời N+1)<br />
                            • <code>ME_CON</code>: Người chính là NU (Đời N) &rarr; Con (Đời N+1)<br />
                            • <code>VO_CHONG</code>: Cả hai người phải cùng thế hệ (Đời N)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sheet 3 & 4 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  <div className="fa-guide-sheet-card" style={{ margin: 0 }}>
                    <div className="fa-guide-sheet-card-header">
                      <span className="fa-guide-sheet-name">Sheet 3: CHI NHÁNH</span>
                      <span className="fa-guide-sheet-desc">Danh mục phân nhánh</span>
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      Gồm 3 cột: <code>ma_chi_tam</code> (Bắt buộc, duy nhất), <code>ten_chi</code> (Bắt buộc), <code>mo_ta</code> (Tùy chọn).
                      <div className="fa-guide-rule-note" style={{ marginTop: '8px' }}>
                        Ví dụ: Mã <code>CHI_1</code> - Tên: <code>Chi Trưởng (Thôn Đông)</code>.
                      </div>
                    </div>
                  </div>

                  <div className="fa-guide-sheet-card" style={{ margin: 0 }}>
                    <div className="fa-guide-sheet-card-header">
                      <span className="fa-guide-sheet-name">Sheet 4: HUONG DAN</span>
                      <span className="fa-guide-sheet-desc">Quy ước tích hợp</span>
                    </div>
                    <div style={{ padding: '12px 14px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      Bảng tra cứu quy chuẩn tích hợp sẵn trong file Excel tải về. Không sửa cấu trúc sheet này để hệ thống đọc file tối ưu.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: 5 CORE RULES */}
            {activeTab === 'rules' && (
              <div className="fa-guide-rules-grid">
                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">1</span>
                    <span className="fa-guide-rule-title">Quy tắc thế hệ cha con (N &rarr; N+1)</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    Nếu người A là Cha/Mẹ của người B, thì đời thứ của B bắt buộc phải bằng <strong>đời thứ của A + 1</strong>. Cụ Thủy Tổ của dòng họ luôn bắt đầu từ <strong>Đời 1</strong>.
                  </div>
                  <div className="fa-guide-rule-note">
                    Lỗi chặn: Không được phép có đời con nhỏ hơn hoặc bằng đời cha/mẹ, không tạo vòng lặp phả hệ.
                  </div>
                </div>

                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">2</span>
                    <span className="fa-guide-rule-title">Quy tắc giới tính theo quan hệ</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    • Quan hệ <code>CHA_CON</code>: Người chính bắt buộc phải có giới tính là <code>NAM</code>.<br />
                    • Quan hệ <code>ME_CON</code>: Người chính bắt buộc phải có giới tính là <code>NU</code>.
                  </div>
                  <div className="fa-guide-rule-note">
                    Giúp bảo đảm sơ đồ phả hệ vẽ đúng nhánh nội tộc, ngoại tộc và dâu rể.
                  </div>
                </div>

                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">3</span>
                    <span className="fa-guide-rule-title">Quy tắc hôn nhân vợ chồng</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    Hai người có quan hệ <code>VO_CHONG</code> bắt buộc phải có <strong>cùng đời thứ</strong> (cùng thế hệ Đời N).
                  </div>
                  <div className="fa-guide-rule-note">
                    Hệ thống sẽ biểu diễn đường nối ngang phu thê trên sơ đồ cây trực hệ.
                  </div>
                </div>

                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">4</span>
                    <span className="fa-guide-rule-title">Toàn vẹn mã tạm (id_tam)</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    Mỗi thành viên trong Sheet THÀNH VIÊN phải có 1 <code>id_tam</code> duy nhất, không trùng lặp. Mọi mã trong Sheet QUAN HỆ bắt buộc phải trỏ đến một người đã khai báo.
                  </div>
                  <div className="fa-guide-rule-note">
                    Tránh lỗi "liên kết mồ côi" khi vẽ cây gia phả.
                  </div>
                </div>

                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">5</span>
                    <span className="fa-guide-rule-title">Đồng nhất trạng thái sống / mất</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    • Nếu <code>con_song = DUNG</code> (hoặc 1): Cột <code>ngay_mat</code> <strong>phải để trống</strong>.<br />
                    • Nếu <code>con_song = SAI</code> (hoặc 0): Được phép điền ngày/năm mất vào <code>ngay_mat</code>.
                  </div>
                  <div className="fa-guide-rule-note">
                    Giúp hệ thống đồng bộ chuẩn xác ngày giỗ và hiển thị nhãn sinh/tử trên thẻ cây.
                  </div>
                </div>

                <div className="fa-guide-rule-card">
                  <div className="fa-guide-rule-header">
                    <span className="fa-guide-rule-num">6</span>
                    <span className="fa-guide-rule-title">Cơ chế Kiểm thử trước (Dry-Run)</span>
                  </div>
                  <div className="fa-guide-rule-body">
                    Hệ thống sẽ quét toàn bộ 4 sheet, nếu có <strong>bất kỳ 1 lỗi vi phạm nào</strong> (sai đời, thiếu ID, sai giới tính), hệ thống sẽ từ chối lưu và chỉ rõ chính xác <strong>Sheet, Dòng, Cột và nguyên nhân</strong> để quý vị sửa.
                  </div>
                  <div className="fa-guide-rule-note">
                    Cam kết an toàn: 100% Rollback, không để lại dữ liệu rác hay lỗi trong cơ sở dữ liệu.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: DATA FORMATS */}
            {activeTab === 'formats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  <div className="fa-guide-sheet-card" style={{ margin: 0 }}>
                    <div className="fa-guide-sheet-card-header">
                      <span className="fa-guide-sheet-name">Định dạng Ngày tháng</span>
                    </div>
                    <div style={{ padding: '14px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      Hệ thống tự động nhận diện và chuẩn hóa các kiểu:
                      <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                        <li>Chuẩn quốc tế: <code>YYYY-MM-DD</code> (VD: <code>1965-05-19</code>)</li>
                        <li>Chỉ có năm: <code>YYYY</code> (VD: <code>1965</code>, <code>1982</code>)</li>
                        <li>Chuẩn ngày Việt Nam: <code>DD/MM/YYYY</code> (VD: <code>19/05/1965</code>)</li>
                      </ul>
                    </div>
                  </div>

                  <div className="fa-guide-sheet-card" style={{ margin: 0 }}>
                    <div className="fa-guide-sheet-card-header">
                      <span className="fa-guide-sheet-name">Giá trị Còn sống (Boolean)</span>
                    </div>
                    <div style={{ padding: '14px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      Các giá trị tương đương được hệ thống chấp nhận:
                      <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                        <li>Còn sống: <code>DUNG</code>, <code>1</code>, <code>TRUE</code>, <code>YES</code></li>
                        <li>Đã mất: <code>SAI</code>, <code>0</code>, <code>FALSE</code>, <code>NO</code></li>
                      </ul>
                    </div>
                  </div>

                  <div className="fa-guide-sheet-card" style={{ margin: 0 }}>
                    <div className="fa-guide-sheet-card-header">
                      <span className="fa-guide-sheet-name">Giới tính (Gender)</span>
                    </div>
                    <div style={{ padding: '14px', fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      Chuẩn hóa theo danh mục hệ thống:
                      <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                        <li>Nam: <code>NAM</code> hoặc <code>MALE</code></li>
                        <li>Nữ: <code>NU</code> hoặc <code>FEMALE</code></li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="fa-import-guide-banner" style={{ margin: 0 }}>
                  <div className="fa-import-guide-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="fa-import-guide-content">
                    <h4>Lời khuyên khi chuẩn bị dữ liệu:</h4>
                    <p>
                      Đối với các bậc tiền nhân nhiều đời trước chưa rõ ngày tháng chính xác, quý vị chỉ cần ghi <strong>Năm sinh</strong> (Ví dụ: <code>1890</code>) hoặc có thể để trống cột ngày sinh nếu phả ký chưa ghi chép rõ.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SAMPLE DATA PREVIEW */}
            {activeTab === 'sample' && (
              <div>
                <p className="fa-guide-sample-desc">
                  Dưới đây là cấu trúc mẫu tối thiểu chuẩn 3 đời đã được kiểm thử tính đúng đắn phả hệ:
                </p>

                <div className="fa-guide-sample-badge-group">
                  <span className="fa-guide-tag-optional" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
                    Ví dụ mẫu Sheet THÀNH VIÊN
                  </span>
                </div>

                <div className="fa-guide-table-responsive" style={{ marginBottom: '18px' }}>
                  <table className="fa-guide-spec-table">
                    <thead>
                      <tr>
                        <th>id_tam</th>
                        <th>ho_ten</th>
                        <th>gioi_tinh</th>
                        <th>doi_thu</th>
                        <th>con_song</th>
                        <th>ngay_sinh</th>
                        <th>ngay_mat</th>
                        <th>chi_nhanh_tam</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>P01</code></td>
                        <td><strong>Dương Tự Cường</strong> (Cụ Thủy Tổ)</td>
                        <td><code>NAM</code></td>
                        <td>1</td>
                        <td>SAI</td>
                        <td>1890</td>
                        <td>1960</td>
                        <td><code>CHI_1</code></td>
                      </tr>
                      <tr>
                        <td><code>P02</code></td>
                        <td><strong>Nguyễn Thị Nhụy</strong> (Cụ Bà Thủy Tổ)</td>
                        <td><code>NU</code></td>
                        <td>1</td>
                        <td>SAI</td>
                        <td>1895</td>
                        <td>1968</td>
                        <td><code>CHI_1</code></td>
                      </tr>
                      <tr>
                        <td><code>P03</code></td>
                        <td><strong>Dương Tự Hải</strong> (Con trai trưởng)</td>
                        <td><code>NAM</code></td>
                        <td>2</td>
                        <td>SAI</td>
                        <td>1925-03-12</td>
                        <td>1998-11-04</td>
                        <td><code>CHI_1</code></td>
                      </tr>
                      <tr>
                        <td><code>P04</code></td>
                        <td><strong>Trần Thị Mai</strong> (Con dâu trưởng)</td>
                        <td><code>NU</code></td>
                        <td>2</td>
                        <td>SAI</td>
                        <td>1928</td>
                        <td>2005</td>
                        <td><code>CHI_1</code></td>
                      </tr>
                      <tr>
                        <td><code>P05</code></td>
                        <td><strong>Dương Tự Minh</strong> (Cháu nội đích tôn)</td>
                        <td><code>NAM</code></td>
                        <td>3</td>
                        <td>DUNG</td>
                        <td>1958-08-20</td>
                        <td><em>(Để trống)</em></td>
                        <td><code>CHI_1</code></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="fa-guide-sample-badge-group">
                  <span className="fa-guide-tag-optional" style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                    Ví dụ mẫu Sheet QUAN HỆ
                  </span>
                </div>

                <div className="fa-guide-table-responsive">
                  <table className="fa-guide-spec-table">
                    <thead>
                      <tr>
                        <th>id_tam_nguoi_chinh</th>
                        <th>id_tam_nguoi_lien_quan</th>
                        <th>loai_quan_he</th>
                        <th>Giải thích liên kết</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><code>P01</code> (Cụ Thủy Tổ)</td>
                        <td><code>P02</code> (Cụ Bà)</td>
                        <td><code>VO_CHONG</code></td>
                        <td>Hôn nhân Đời 1 (cùng thế hệ)</td>
                      </tr>
                      <tr>
                        <td><code>P01</code> (Cụ Thủy Tổ - Đời 1)</td>
                        <td><code>P03</code> (Ông Hải - Đời 2)</td>
                        <td><code>CHA_CON</code></td>
                        <td>Cha sinh con trai Đời 2 (1 &rarr; 2)</td>
                      </tr>
                      <tr>
                        <td><code>P02</code> (Cụ Bà - Đời 1)</td>
                        <td><code>P03</code> (Ông Hải - Đời 2)</td>
                        <td><code>ME_CON</code></td>
                        <td>Mẹ sinh con trai Đời 2 (1 &rarr; 2)</td>
                      </tr>
                      <tr>
                        <td><code>P03</code> (Ông Hải)</td>
                        <td><code>P04</code> (Bà Mai)</td>
                        <td><code>VO_CHONG</code></td>
                        <td>Hôn nhân Đời 2 (cùng thế hệ)</td>
                      </tr>
                      <tr>
                        <td><code>P03</code> (Ông Hải - Đời 2)</td>
                        <td><code>P05</code> (Anh Minh - Đời 3)</td>
                        <td><code>CHA_CON</code></td>
                        <td>Cha sinh con trai Đời 3 (2 &rarr; 3)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

