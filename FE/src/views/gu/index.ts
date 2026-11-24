/**
 * View (User Interface) - GU: Guest / Family Representative UI
 * Theo kiến trúc MFGMS-AI Module View (MVC)
 * 
 * Chức năng:
 * - Search person / family
 * - View public family tree (including focus view)
 * - View public archive
 * - Send link request
 * - View linked families
 * - View public worship space
 * - AI chat (public)
 */

// Home & Family Search
export { default as PublicHomePage } from '../../pages/public/Home/PublicHomePage';
export { default as PublicFamilySearchPage } from '../../pages/public/FamilySearch/PublicFamilySearchPage';

// Public Family Tree
export { default as PublicFamilyTreePage } from '../../pages/public/FamilyTree/PublicFamilyTreePage';

// Public Archive
export { default as PublicArchivePage } from '../../pages/public/Archive/PublicArchivePage';

// Public Worship Space
export { default as PublicWorshipHallPage } from '../../pages/public/WorshipHall/PublicWorshipHallPage';

// Send Link Request & Join Modals
export { ClanJoinModal as PublicClanJoinView } from '../../components/guest/ClanJoinModal';
export { InterClanLinkRequestModal as PublicLinkRequestView } from '../../components/guest/InterClanLinkRequestModal';

// AI Chat (Public)
export { PublicAIAssistantModal as PublicAIAssistantView } from '../../components/guest/PublicAIAssistantModal';
