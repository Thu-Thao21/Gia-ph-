/**
 * View (User Interface) - FA: Family Administrator UI
 * Theo kiến trúc MFGMS-AI Module View (MVC)
 * 
 * Chức năng:
 * - Dashboard
 * - Family member management
 * - Family settings
 * - Genealogy management (including focus view)
 * - Activities & funds
 * - Worship space management
 * - Archive management
 * - Reports
 * - Personal settings
 */

// Dashboard
export { FamilyAdminModule as FamilyAdminDashboardView } from '../../features/familyAdmin/FamilyAdminModule';

// Family Member Management
export { MemberList as FamilyMemberList } from '../../components/profile/MemberList';
export { ClanMembersModule as FamilyMembersModule } from '../../components/clan/ClanMembersModule';

// Family Settings & Profile
export { ClanProfilePage as FamilySettingsView } from '../../components/clan/ClanProfilePage';

// Genealogy Management (including focus view & Studio)
export { TreeLayout as GenealogyManagementView } from '../../shared/tree/TreeLayout';
export { GenealogyChartStudio as GenealogyStudioView } from '../../shared/tree/GenealogyChartStudio';

// Activities & Funds
export { ClanEventsModule as FamilyActivitiesEventsView } from '../../components/member/ClanEventsModule';
export { ClanFundsModule as FamilyFundsView } from '../../components/member/ClanFundsModule';

// Worship Space Management
export { DigitalAncestralHallModule as WorshipSpaceManagementView } from '../../components/member/DigitalAncestralHallModule';

// Archive Management
export { ClanDocumentsModule as FamilyArchiveView } from '../../components/member/ClanDocumentsModule';

// Reports & Quality
export { ClanDataQualityModule as FamilyDataQualityReportView } from '../../components/clan/ClanDataQualityModule';
