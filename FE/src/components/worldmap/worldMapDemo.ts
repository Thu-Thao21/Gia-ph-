/*
 * DỮ LIỆU GIẢ cho chế độ ?demo=1 của bản đồ thế giới (vài quốc gia). Không có request mạng, không phải dữ liệu thật.
 * Chỉ được nạp bằng import() trong nhánh import.meta.env.DEV (xem useWorldMapPoints) nên không vào bản build production.
 */
import type { ClanLocation, PersonBurial } from '../../types/location';
import type { BurialEntry } from './worldMapData';

const CLAN = 'demo-clan';

const loc = (
  id: string,
  name: string,
  locationType: ClanLocation['locationType'],
  address: string,
  latitude: number,
  longitude: number,
): ClanLocation => ({
  id,
  clanId: CLAN,
  name,
  locationType,
  address,
  latitude,
  longitude,
  privacyLevel: 'CLAN_ONLY',
});

const grave = (
  id: string,
  personName: string,
  cemeteryName: string,
  address: string,
  latitude: number,
  longitude: number,
): BurialEntry => ({
  personName,
  burial: {
    burialId: id,
    personId: `demo-person-${id}`,
    clanId: CLAN,
    cemeteryName,
    address,
    latitude,
    longitude,
    privacyLevel: 'CLAN_ONLY',
  } as PersonBurial,
});

export const DEMO_LOCATIONS: ClanLocation[] = [
  loc('d1', 'Nhà thờ họ (demo)', 'ANCESTRAL_HALL', 'Làng cổ Đường Lâm, Sơn Tây, Hà Nội, Việt Nam', 21.1, 105.47),
  loc('d2', 'Từ đường chi Huế (demo)', 'BRANCH_HALL', 'Thành phố Huế, Việt Nam', 16.4637, 107.5909),
  loc('d3', 'Đất tổ quê hương (demo)', 'HOMELAND', 'Hội An, Quảng Nam, Việt Nam', 15.8801, 108.338),
  loc('d4', 'Di tích lịch sử (demo)', 'HISTORIC_SITE', 'Đà Nẵng, Việt Nam', 16.0544, 108.2022),
  loc('d5', 'Từ đường chi Seoul (demo)', 'BRANCH_HALL', 'Jongno-gu, Seoul, Hàn Quốc', 37.5729, 126.9794),
  loc('d6', 'Nơi họp mặt San Jose (demo)', 'EVENT_VENUE', 'San Jose, California, Hoa Kỳ', 37.3382, -121.8863),
  loc('d7', 'Từ đường chi Paris (demo)', 'BRANCH_HALL', 'Paris, Pháp', 48.8566, 2.3522),
  loc('d8', 'Địa điểm khác Sydney (demo)', 'OTHER', 'Sydney, Úc', -33.8688, 151.2093),
];

export const DEMO_BURIALS: BurialEntry[] = [
  grave('b1', 'Nguyễn Văn A (demo)', 'Nghĩa trang họ Đường Lâm', 'Sơn Tây, Hà Nội, Việt Nam', 21.0985, 105.4712),
  grave('b2', 'Nguyễn Thị B (demo)', 'Nghĩa trang Huế', 'Huế, Việt Nam', 16.4501, 107.5712),
  grave('b3', 'Nguyễn Văn C (demo)', 'Seoul Memorial Park', 'Seoul, Hàn Quốc', 37.49, 127.03),
  grave('b4', 'Nguyễn Văn D (demo)', 'Oak Hill Memorial Park', 'San Jose, California, Hoa Kỳ', 37.3, -121.85),
  grave('b5', 'Nguyễn Thị E (demo)', 'Père-Lachaise', 'Paris, Pháp', 48.8614, 2.3933),
];
