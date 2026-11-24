/**
 * View (User Interface) - BO: Clan Leader / Business Owner UI
 * Theo kiến trúc MFGMS-AI Module View (MVC)
 * 
 * Chức năng:
 * - Dashboard
 * - Family profile management
 * - Member management
 * - Genealogy management
 * - Relationship & search
 * - Inter-family connection
 * - Activities & funds
 * - Digital worship space
 * - Archive management
 * - Reports & statistics
 * - Personal settings
 */

// Dashboard
export { ClanLeaderDashboardSection } from '../../components/dashboard/ClanLeaderDashboardSection';

// Family Profile Management
export { ClanProfilePage } from '../../components/clan/ClanProfilePage';

// Member Management
export { ClanMembersModule } from '../../components/clan/ClanMembersModule';
export { ClanJoinRequestsSection } from '../../components/clan/ClanJoinRequestsSection';

// Genealogy Management & Tree Studio
export { TreeLayout as GenealogyTreeView } from '../../shared/tree/TreeLayout';
export { GenealogyChartStudio as GenealogyTreeStudioView } from '../../shared/tree/GenealogyChartStudio';

// Relationship & Search
export { RelationshipFinder as RelationshipSearchView } from '../../components/member/RelationshipFinder';

// Inter-Family Connection
export { AffiliatedFamiliesTab as AffiliatedFamiliesView } from '../../components/network/AffiliatedFamiliesTab';
export { InLawMarriagesTab as InLawMarriagesView } from '../../components/network/InLawMarriagesTab';

// Activities & Funds (Bao gồm Bảng vinh danh Top 10)
export { ClanEventsModule as ActivitiesEventsView } from '../../components/member/ClanEventsModule';
export { ClanFundsModule as ActivitiesFundsView } from '../../components/member/ClanFundsModule';

// Digital Worship Space
export { DigitalAncestralHallModule as DigitalWorshipSpaceView } from '../../components/member/DigitalAncestralHallModule';

// Archive Management
export { ClanDocumentsModule as ArchiveManagementView } from '../../components/member/ClanDocumentsModule';

// Reports & Statistics
export { ClanDataQualityModule as DataQualityReportView } from '../../components/clan/ClanDataQualityModule';
export { AIExcelAuditView as SmartExcelAuditView } from '../../components/clan/AIExcelAuditView';

// Settings & AI Configuration
export { ClanAISettingsPage as AISettingsView } from '../../components/clan/ClanAISettingsPage';
