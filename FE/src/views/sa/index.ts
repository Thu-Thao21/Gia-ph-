/**
 * View (User Interface) - SA: System Administrator UI
 * Theo kiến trúc MFGMS-AI Module View (MVC)
 * 
 * Chức năng:
 * - Login / Logout
 * - User management
 * - Role & permission management
 * - System configuration
 * - Audit log
 * - Data management
 * - Reports & statistics
 * - General settings
 */

// Dashboard & Overview
export { default as SystemAdminDashboard } from '../../components/dashboard/AdminDashboard/AdminDashboard';
export { BusinessRegistrationsChart } from '../../components/dashboard/AdminDashboard/BusinessRegistrationsChart';

// User & Role Management
export { AdminAccountMgmt as UserManagementView } from '../../components/admin/AdminAccountMgmt';
export { AdminApprovalsMgmt as ClanApprovalsView } from '../../components/admin/AdminApprovalsMgmt';
export { AdminMembersMgmt as MemberManagementView } from '../../components/admin/AdminMembersMgmt';

// System Configuration & Settings
export { PlatformAdmin as PlatformAdminView } from '../../components/admin/PlatformAdmin';

// Audit Log & Data Management
export { AdminAuditLogsMgmt as AuditLogView } from '../../components/admin/AdminAuditLogsMgmt';
export { AdminDataBackupMgmt as DataBackupView } from '../../components/admin/AdminDataBackupMgmt';

// Family & Links Management
export { AdminFamiliesMgmt as FamiliesManagementView } from '../../components/admin/AdminFamiliesMgmt';
export { AdminFamilyLinksMgmt as FamilyLinksManagementView } from '../../components/admin/AdminFamilyLinksMgmt';
