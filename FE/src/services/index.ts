/**
 * MFGMS-AI - Services Layer (Matching C01 - C08 Controllers)
 * 
 * C01: Auth & Access Controller -> authService, adminService
 * C02: Family Management Controller -> businessService, clanJoinService, memberService
 * C03: Genealogy Controller -> genealogyService, treeService, locationService
 * C04: Inter-Family Controller -> networkService
 * C05: Activity & Fund Controller -> fundService
 * C06: Worship Space Controller -> worshipHallService
 * C07: Archive & Media Controller -> archiveService
 * C08: AI Assistant Controller -> aiService
 */

// C01. Auth & Access
export * as C01_AuthAccess from './auth.service';
export * as C01_AdminAccess from './admin.service';

// C02. Family Management
export * as C02_Business from './business.service';
export * as C02_ClanJoin from './clanJoin.service';
export * as C02_Member from './member.service';

// C03. Genealogy
export * as C03_Genealogy from './genealogy.service';
export * as C03_Tree from './tree.service';
export * as C03_Location from './location.service';

// C04. Inter-Family
export * as C04_InterFamily from './network.service';

// C05. Activity & Fund
export * as C05_ActivityFund from './fund.service';

// C06. Worship Space
export * as C06_WorshipSpace from './worshipHall.service';

// C07. Archive & Media
export * as C07_ArchiveMedia from './archive.service';

// C08. AI Assistant
export * as C08_AIAssistant from './ai.service';

// Notification service
export * as NotificationService from './notification.service';

// Direct re-exports for backward compatibility
export * from './auth.service';
export * from './admin.service';
export * from './business.service';
export * from './clanJoin.service';
export * from './member.service';
export * from './genealogy.service';
export * from './tree.service';
export * from './location.service';
export * from './network.service';
export * from './fund.service';
export * from './worshipHall.service';
export * from './archive.service';
export * from './ai.service';
export * from './notification.service';
