/**
 * View (User Interface) - ME: Family Member UI
 * Theo kiến trúc MFGMS-AI Module View (MVC)
 * 
 * Chức năng:
 * - Personal profile
 * - View family tree (including focus view)
 * - Search & view relatives
 * - Family activities
 * - View digital worship space
 * - View archive
 * - AI assistant
 * - Personal settings
 */

// Dashboard & Overview
export { MemberDashboard as MemberDashboardView } from '../../components/roles/member/MemberDashboard';

// Personal Profile
export { ProfileLayout as PersonalProfileView } from '../../components/profile/ProfileLayout';

// View Family Tree (including Focus View)
export { TreeLayout as ViewFamilyTreeView } from '../../shared/tree/TreeLayout';

// Search & View Relatives
export { RelationshipFinder as RelativesSearchView } from '../../components/member/RelationshipFinder';

// Family Activities & Proposals
export { ClanEventsModule as FamilyActivitiesView } from '../../components/member/ClanEventsModule';
export { MyProposalsModule as MemberProposalsView } from '../../components/member/MyProposalsModule';

// View Digital Worship Space
export { DigitalAncestralHallModule as MemberWorshipSpaceView } from '../../components/member/DigitalAncestralHallModule';

// View Archive
export { ClanDocumentsModule as MemberArchiveView } from '../../components/member/ClanDocumentsModule';

// AI Assistant & Privacy Consents
export { ClanAIAssistantModule as AIAssistantView } from '../../components/member/ClanAIAssistantModule';
export { AIConsentModule as AIConsentManagementView } from '../../components/member/AIConsentModule';
