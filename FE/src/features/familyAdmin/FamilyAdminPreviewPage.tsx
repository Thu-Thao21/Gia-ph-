import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FamilyAdminModule, type FamilyAdminView } from './FamilyAdminModule';
import { AnniversariesModule } from '../../components/member/AnniversariesModule';
import { ClanEventsModule } from '../../components/member/ClanEventsModule';
import { ClanFundsModule } from '../../components/member/ClanFundsModule';
import { ClanDocumentsModule } from '../../components/member/ClanDocumentsModule';
import { ClanAIAssistantModule } from '../../components/member/ClanAIAssistantModule';
import { DigitalAncestralHallModule } from '../../components/member/DigitalAncestralHallModule';

type PreviewView = FamilyAdminView | 'memorials' | 'events' | 'funds' | 'documents' | 'ai' | 'worship';
const tabs: Array<[PreviewView, string]> = [
  ['overview', 'Tổng quan'], ['members', 'Person'], ['relations', 'Quan hệ'],
  ['branches', 'Chi/Nhánh'], ['tree', 'Cây'], ['search', 'Tra cứu'],
  ['approvals', 'Phê duyệt'], ['accounts', 'Tài khoản'], ['links', 'Liên họ'],
  ['exchange', 'Nhập xuất'], ['audit', 'Nhật ký'],
  ['memorials', 'Ngày giỗ'], ['events', 'Sự kiện'], ['funds', 'Quỹ'],
  ['documents', 'Tư liệu'], ['ai', 'AI mẫu'], ['worship', 'Phòng thờ'],
];

export const FamilyAdminPreviewPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view');
  const active = tabs.some(([id]) => id === requested) ? requested as PreviewView : 'overview';
  const navigate = (view: PreviewView) => setParams(view === 'overview' ? {} : { view });
  const extra = ['memorials', 'events', 'funds', 'documents', 'ai', 'worship'].includes(active);

  return <div className="fa-preview-page">
    <nav className="fa-preview-nav" aria-label="Xem trước Family Admin">
      <Link to="/public">Gia Phả Việt</Link>
      <div>{tabs.map(([id, label]) => <button type="button" key={id} className={active === id ? 'active' : ''} onClick={() => navigate(id)}>{label}</button>)}</div>
    </nav>
    {extra ? <div className="fa-preview-extra"><p className="fa-preview-disclaimer">Bản xem trước frontend: nội dung và thao tác bên dưới chưa đồng bộ máy chủ. AI chỉ trả lời mẫu.</p>
      {active === 'memorials' && <AnniversariesModule />}
      {active === 'events' && <ClanEventsModule canManage />}
      {active === 'funds' && <ClanFundsModule canManage />}
      {active === 'documents' && <ClanDocumentsModule canManage />}
      {active === 'ai' && <ClanAIAssistantModule />}
      {active === 'worship' && <DigitalAncestralHallModule />}
    </div> : <FamilyAdminModule view={active as FamilyAdminView} onNavigate={navigate} />}
  </div>;
};

export default FamilyAdminPreviewPage;
