import React from 'react';
import { ClanEventsModule } from './ClanEventsModule';

/**
 * Backward-compatibility wrapper for AnniversariesModule.
 * Renders the unified ClanEventsModule with the "memorials" (Lịch ngày giỗ) tab active.
 */
export const AnniversariesModule: React.FC = () => {
  return <ClanEventsModule canManage initialTab="memorials" />;
};

export default AnniversariesModule;
