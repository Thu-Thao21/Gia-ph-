// Test phần tọa độ của 3 form dùng hộp chọn vị trí: chưa có tọa độ thì null (không mặc định, không gửi 0).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NO_COORDS_LABEL,
  formatFormCoords,
  initialFormCoords,
  requireFormCoords,
} from '../src/components/common/locationFormCoords';
import { BurialEditModal } from '../src/components/common/BurialEditModal';
import { LocationProposalModal } from '../src/components/common/LocationProposalModal';
import { ClanLocationEditModal } from '../src/components/clan/ClanLocationEditModal';

const root = process.cwd(); // npm test chạy với cwd = thư mục FE
const noop = () => {};

describe('initialFormCoords / requireFormCoords', () => {
  it('có đủ tọa độ hợp lệ thì giữ nguyên như cũ', () => {
    assert.deepEqual(initialFormCoords(16.0544, 108.2022), { lat: 16.0544, lng: 108.2022 });
    assert.deepEqual(requireFormCoords(16.0544, 108.2022), { lat: 16.0544, lng: 108.2022 });
  });
  it('thiếu/null/NaN/một nửa/(0,0) -> null, không bao giờ trả 0 hay tọa độ mặc định', () => {
    for (const [a, b] of [
      [undefined, undefined],
      [null, null],
      [16, null],
      [null, 108],
      [NaN, 108],
      [0, 0],
    ] as const) {
      assert.deepEqual(initialFormCoords(a, b), { lat: null, lng: null });
      assert.equal(requireFormCoords(a, b), null);
    }
  });
  it('hiển thị: chưa chọn -> "Chưa chọn vị trí"; đã chọn -> 6 số thập phân, vĩ độ trước', () => {
    assert.equal(formatFormCoords(null, null), NO_COORDS_LABEL);
    assert.equal(formatFormCoords(16.0544, 108.2022), '16.054400, 108.202200');
  });
});

describe('3 form: tạo mới không có tọa độ', () => {
  const forms: Array<[string, React.ReactElement]> = [
    ['BurialEditModal', <BurialEditModal isOpen onClose={noop} personId="p1" personName="Nguyễn Văn A" />],
    [
      'LocationProposalModal',
      <LocationProposalModal isOpen onClose={noop} clanId="c1" targetType="CLAN_LOCATION" locationName="Nhà thờ" />,
    ],
    ['ClanLocationEditModal', <ClanLocationEditModal isOpen onClose={noop} clanId="c1" onSuccess={noop} />],
  ];
  for (const [name, element] of forms) {
    it(`${name}: hiện "Chưa chọn vị trí", không có tọa độ mặc định`, () => {
      const html = renderToStaticMarkup(element);
      assert.ok(html.includes(NO_COORDS_LABEL), html.slice(0, 200));
      assert.ok(!html.includes('15.8893') && !html.includes('108.2392'));
      assert.ok(!html.includes('NaN') && !html.includes('0.000000'));
    });
  }
  it('BurialEditModal có tọa độ cũ: hiện đúng như trước', () => {
    const html = renderToStaticMarkup(
      <BurialEditModal
        isOpen
        onClose={noop}
        personId="p1"
        personName="A"
        initialData={{ latitude: 16.0544, longitude: 108.2022 } as never}
      />,
    );
    assert.ok(html.includes('16.054400, 108.202200'));
  });
});

describe('mã nguồn 3 form không còn tọa độ mặc định', () => {
  for (const f of [
    'src/components/clan/ClanLocationEditModal.tsx',
    'src/components/common/BurialEditModal.tsx',
    'src/components/common/LocationProposalModal.tsx',
  ]) {
    it(f, () => {
      const src = readFileSync(join(root, f), 'utf8');
      assert.ok(!src.includes('15.8893') && !src.includes('108.2392'));
      assert.ok(src.includes('requireFormCoords'), 'phải chặn lưu khi chưa có tọa độ');
    });
  }
});
