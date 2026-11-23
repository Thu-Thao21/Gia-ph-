// chartConfigTypes.ts - Định nghĩa kiểu dữ liệu & mẫu chủ đề cho Tùy chỉnh Phả đồ & Xuất bản in

export type ChartDisplayMode = 'standard' | 'full-clan' | 'direct-lineage' | 'traditional';
export type ChartDirection = 'vertical' | 'horizontal';
export type ChartThemeId = 'vietnamese-traditional' | 'royal-classic' | 'modern-clean' | 'custom';
export type CardColorMode = 'generation' | 'status' | 'gender';
export type LineStyle = 'solid' | 'dashed';
export type GenerationNumberFormat = 'number' | 'roman' | 'none';
export type PaperSize = 'A4' | 'A3' | 'A2' | 'A1' | 'banner';
export type PaperOrientation = 'landscape' | 'portrait';

export interface GenealogyChartConfig {
  // 1. Bố cục & Nhánh
  displayMode: ChartDisplayMode;
  direction: ChartDirection;
  expandAll: boolean;
  maxGenerations: number; // 0 = toàn bộ
  focusPersonId?: string;
  selectedBranch?: string;
  siblingSpacing: number; // Khoảng cách giữa các thẻ anh chị em: 24 - 100px (mặc định 48)
  generationSpacing: number; // Khoảng cách giữa các thế hệ: 48 - 160px (mặc định 96)
  zigzagCompact: boolean; // Bố trí so le / ziczac khi nhánh quá đông
  genNumberFormat: GenerationNumberFormat; // 'Đời 1' | 'Thế hệ I' | tắt

  // Tùy chọn ẩn / hiện thông tin
  showSpouses: boolean; // Hiển thị người phối ngẫu (Dâu / Rể)
  showExSpouses: boolean; // Hiển thị quan hệ hôn nhân đã kết thúc
  showOutsiders: boolean; // Hiển thị người ngoại tộc / thông gia
  showBirthDeath: boolean; // Năm sinh - năm mất
  showOccupation: boolean; // Chức vị / nghề nghiệp
  showBurial: boolean; // Nơi an táng / phần mộ
  showAvatars: boolean; // Ảnh chân dung / biểu tượng đại diện

  // 2. Màu sắc, Khung nền & Trang trí truyền thống
  themeId: ChartThemeId;
  cardColorMode: CardColorMode;
  lineColor: string;
  lineStyle: LineStyle;
  lineWidth: number;
  backgroundColor: string;
  backgroundPattern: 'none' | 'dong-son' | 'parchment' | 'modern-dots';

  // Yếu tố truyền thống Việt Nam
  showBorder: boolean; // Bật/tắt khung viền nghệ thuật
  borderStyle: 'traditional' | 'royal' | 'modern';
  showWatermark: boolean; // Họa tiết hoa văn Trống đồng Đông Sơn
  showCouplets: boolean; // Hai câu đối hai bên phả đồ
  coupletLeft: string; // Câu đối vế trái
  coupletRight: string; // Câu đối vế phải
  chartTitle: string; // Tiêu đề phả đồ (ví dụ: PHẢ ĐỒ MAI THẾ TỘC)
  founderTitle: string; // Tên Thủy tổ / Khởi tổ
  progenitorTitle?: string; // Tên Thủy tổ (alias)
  showClanHeader?: boolean; // Hiển thị cuốn thư tiêu đề trên canvas
  clanBranchSubtitle: string; // Chi nhánh / Địa danh
  showSeal: boolean; // Triện son ngọc phả ("Gia Phả Bảo Ấn")
  fontFamily: 'serif' | 'sans';
  fontSizeScale: number; // 0.85 - 1.3

  // 3. Xuất bản in & Khổ giấy
  paperSize: PaperSize;
  paperOrientation: PaperOrientation;
  showPrintDate: boolean;
  showWatermarkPrint: boolean;
  printDpi: number; // 150 | 300
}

export interface ChartThemePreset {
  id: ChartThemeId;
  name: string;
  description: string;
  badge: string;
  config: Partial<GenealogyChartConfig>;
}

export const THEME_PRESETS: ChartThemePreset[] = [
  {
    id: 'vietnamese-traditional',
    name: 'Truyền thống Việt Nam',
    description: 'Họa tiết Trống đồng Đông Sơn, nền giấy điệp hoàng bào, câu đối vàng son, viền hồi văn cổ điển.',
    badge: 'Đặc trưng Việt Nam',
    config: {
      themeId: 'vietnamese-traditional',
      backgroundColor: '#fdf8ee',
      backgroundPattern: 'dong-son',
      lineColor: '#b45309',
      lineStyle: 'solid',
      lineWidth: 2,
      cardColorMode: 'generation',
      showBorder: true,
      borderStyle: 'traditional',
      showWatermark: true,
      showCouplets: true,
      coupletLeft: 'TỔ CÔNG TÔNG ĐỨC THIÊN NIÊN THỊNH',
      coupletRight: 'TỬ HIẾU TÔN HIỀN VẠN ĐẠI VINH',
      showSeal: true,
      fontFamily: 'serif',
      fontSizeScale: 1.0,
      genNumberFormat: 'number',
    },
  },
  {
    id: 'royal-classic',
    name: 'Phả đồ Cổ điển Hoàng gia',
    description: 'Tông đỏ son trầm quý phái, viền son thiếp vàng, triện ngọc phả son đỏ, trang trọng cho nhà thờ họ.',
    badge: 'Hoàng gia son thắm',
    config: {
      themeId: 'royal-classic',
      backgroundColor: '#faf4eb',
      backgroundPattern: 'parchment',
      lineColor: '#991b1b',
      lineStyle: 'solid',
      lineWidth: 2.5,
      cardColorMode: 'generation',
      showBorder: true,
      borderStyle: 'royal',
      showWatermark: true,
      showCouplets: true,
      coupletLeft: 'MỘC XUẤT THIÊN CHI DO HỮU BỔN',
      coupletRight: 'THỦY LƯU VẠN PHÁI TỔNG ĐỒNG NGUYÊN',
      showSeal: true,
      fontFamily: 'serif',
      fontSizeScale: 1.05,
      genNumberFormat: 'number',
    },
  },
  {
    id: 'modern-clean',
    name: 'Hiện đại Thanh lịch',
    description: 'Phong cách tối giản, nền sáng sang trọng, thẻ phẳng bóng mờ, đường nét thanh thoát tinh gọn.',
    badge: 'Tối giản hiện đại',
    config: {
      themeId: 'modern-clean',
      backgroundColor: '#f8fafc',
      backgroundPattern: 'modern-dots',
      lineColor: '#2563eb',
      lineStyle: 'solid',
      lineWidth: 2,
      cardColorMode: 'status',
      showBorder: true,
      borderStyle: 'modern',
      showWatermark: false,
      showCouplets: false,
      showSeal: false,
      fontFamily: 'sans',
      fontSizeScale: 1.0,
      genNumberFormat: 'roman',
    },
  },
];

export const DEFAULT_GENEALOGY_CHART_CONFIG: GenealogyChartConfig = {
  displayMode: 'traditional',
  direction: 'vertical',
  expandAll: true,
  maxGenerations: 0,
  siblingSpacing: 48,
  generationSpacing: 96,
  zigzagCompact: false,
  genNumberFormat: 'number',

  showSpouses: true,
  showExSpouses: false,
  showOutsiders: true,
  showBirthDeath: true,
  showOccupation: true,
  showBurial: true,
  showAvatars: true,

  themeId: 'vietnamese-traditional',
  cardColorMode: 'generation',
  lineColor: '#b45309',
  lineStyle: 'solid',
  lineWidth: 2,
  backgroundColor: '#fdf8ee',
  backgroundPattern: 'dong-son',

  showBorder: true,
  borderStyle: 'traditional',
  showWatermark: true,
  showCouplets: true,
  coupletLeft: 'TỔ CÔNG TÔNG ĐỨC THIÊN NIÊN THỊNH',
  coupletRight: 'TỬ HIẾU TÔN HIỀN VẠN ĐẠI VINH',
  chartTitle: 'PHẢ ĐỒ MAI THẾ TỘC',
  founderTitle: 'Khởi tổ: Mai An Tiêm',
  clanBranchSubtitle: 'Phong Điền - Thừa Thiên Huế',
  showSeal: true,
  fontFamily: 'serif',
  fontSizeScale: 1.0,

  paperSize: 'A3',
  paperOrientation: 'landscape',
  showPrintDate: true,
  showWatermarkPrint: true,
  printDpi: 300,
};
