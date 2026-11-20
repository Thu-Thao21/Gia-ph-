// Test hộp chọn tọa độ (LocationPickerModal): logic thuần + dựng HTML tĩnh. Không có DOM/WebGL thật.
// Không đọc FE/.env.local.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  addressAfterSearch,
  buildConfirmPayload,
  canConfirmPick,
  computePickerInitialView,
  confirmPick,
  coordsFromInitial,
  coordsFromText,
  parseCoordInput,
  textsFromCoords,
  textsFromPick,
} from '../src/components/common/locationPickerLogic';
import { LocationPickerModal } from '../src/components/common/LocationPickerModal';

const root = process.cwd(); // npm test chạy với cwd = thư mục FE

describe('đổi tọa độ <-> ghim (qua hai ô nhập)', () => {
  it('gõ đủ hai ô hợp lệ -> có tọa độ; chấp nhận dấu phẩy thập phân', () => {
    assert.deepEqual(coordsFromText('16.0544', '108.2022'), { lat: 16.0544, lng: 108.2022 });
    assert.deepEqual(coordsFromText('16,0544', ' 108,2022 '), { lat: 16.0544, lng: 108.2022 });
    assert.deepEqual(coordsFromText('-33.86', '151.2'), { lat: -33.86, lng: 151.2 });
  });
  it('ô trống / chữ / ngoài miền / (0,0) -> không có tọa độ (ghim ẩn)', () => {
    assert.equal(coordsFromText('', ''), null);
    assert.equal(coordsFromText('16', ''), null);
    assert.equal(coordsFromText('abc', '108'), null);
    assert.equal(coordsFromText('91', '108'), null);
    assert.equal(coordsFromText('16', '181'), null);
    assert.equal(coordsFromText('0', '0'), null);
    assert.equal(coordsFromText('1e3', '1'), null);
    assert.equal(parseCoordInput('Infinity'), null);
    assert.equal(parseCoordInput('-'), null);
  });
  it('bấm/kéo ghim tới một điểm -> hai ô điền 6 số thập phân và đọc ngược ra đúng điểm đó', () => {
    const t = textsFromPick(16.054400123456, 108.202199999);
    assert.deepEqual(t, { latText: '16.0544', lngText: '108.2022' });
    assert.deepEqual(coordsFromText(t.latText, t.lngText), { lat: 16.0544, lng: 108.2022 });
    const t2 = textsFromPick(10.123456789, 106.987654321);
    assert.deepEqual(t2, { latText: '10.123457', lngText: '106.987654' });
  });
  it('tọa độ ban đầu: có thì điền vào ô; thiếu/null/NaN/(0,0) thì để TRỐNG, không điền mặc định', () => {
    assert.deepEqual(textsFromCoords(coordsFromInitial(16.0544, 108.2022)), { latText: '16.0544', lngText: '108.2022' });
    for (const [a, b] of [
      [undefined, undefined],
      [null, null],
      [NaN, 108],
      [16, null],
      [0, 0],
    ] as const) {
      assert.equal(coordsFromInitial(a, b), null);
      assert.deepEqual(textsFromCoords(coordsFromInitial(a, b)), { latText: '', lngText: '' });
    }
  });
});

describe('khung nhìn ban đầu', () => {
  it('chưa có tọa độ -> khung Việt Nam [102,8]-[110,23.5]', () => {
    const view = computePickerInitialView(null, 780, 380);
    assert.equal(view.kind, 'bounds');
    if (view.kind !== 'bounds') return;
    assert.deepEqual(view.bounds, [
      [102, 8],
      [110, 23.5],
    ]);
  });
  it('fitOptions không bao giờ có khóa maxZoom (kể cả undefined); padding hữu hạn, không âm', () => {
    for (const [w, h] of [
      [780, 380],
      [0, 0],
      [NaN, 300],
    ]) {
      const view = computePickerInitialView(null, w, h);
      assert.equal(view.kind, 'bounds');
      if (view.kind !== 'bounds') continue;
      assert.ok(!('maxZoom' in view.fitOptions), `maxZoom không được có trong ${JSON.stringify(view.fitOptions)}`);
      assert.ok(Number.isFinite(view.fitOptions.padding) && view.fitOptions.padding >= 0);
      assert.equal(view.fitOptions.duration, 0);
    }
    assert.equal((computePickerInitialView(null, 0, 0) as { fitOptions: { padding: number } }).fitOptions.padding, 0);
  });
  it('có tọa độ -> zoom vào đó (tâm [kinh, vĩ])', () => {
    const view = computePickerInitialView({ lat: 16.0544, lng: 108.2022 }, 780, 380);
    assert.deepEqual(view, { kind: 'point', center: [108.2022, 16.0544], zoom: 16 });
  });
});

describe('xác nhận vị trí', () => {
  it('chưa chọn thì không xác nhận được và onSave không bao giờ được gọi', () => {
    let calls = 0;
    assert.equal(canConfirmPick(null, false), false);
    assert.equal(buildConfirmPayload(null, 'x'), null);
    assert.equal(confirmPick(null, 'x', false, () => void calls++), false);
    assert.equal(calls, 0);
  });
  it('chế độ chỉ xem thì không xác nhận được dù có tọa độ', () => {
    let calls = 0;
    assert.equal(canConfirmPick({ lat: 1, lng: 2 }, true), false);
    assert.equal(confirmPick({ lat: 1, lng: 2 }, '', true, () => void calls++), false);
    assert.equal(calls, 0);
  });
  it('sau khi chọn thì onSave nhận đúng lat/lng/địa chỉ', () => {
    const got: Array<[number, number, string]> = [];
    const coords = coordsFromText(textsFromPick(16.0544, 108.2022).latText, textsFromPick(16.0544, 108.2022).lngText);
    assert.equal(canConfirmPick(coords, false), true);
    assert.equal(confirmPick(coords, 'Đà Nẵng', false, (a, b, c) => void got.push([a, b, c])), true);
    assert.deepEqual(got, [[16.0544, 108.2022, 'Đà Nẵng']]);
  });
  it('tìm địa chỉ chỉ điền ô địa chỉ khi đang trống', () => {
    assert.equal(addressAfterSearch('', 'Hội An, Quảng Nam'), 'Hội An, Quảng Nam');
    assert.equal(addressAfterSearch('   ', 'Hội An'), 'Hội An');
    assert.equal(addressAfterSearch('Thôn 3, xã A', 'Hội An'), 'Thôn 3, xã A');
  });
});

describe('dựng hộp chọn (HTML tĩnh)', () => {
  const noop = () => {};

  it('chưa có tọa độ ban đầu: hai ô trống, nút Xác nhận bị vô hiệu, không có tọa độ mặc định', () => {
    const html = renderToStaticMarkup(<LocationPickerModal isOpen onClose={noop} onSave={noop} />);
    assert.match(html, /id="location-picker-lat"[^>]*value=""/);
    assert.match(html, /id="location-picker-lng"[^>]*value=""/);
    assert.match(html, /<button[^>]*class="location-picker-btn save"[^>]*disabled=""|<button[^>]*disabled=""[^>]*class="location-picker-btn save"/);
    assert.ok(!html.includes('15.8893') && !html.includes('108.2392'));
    assert.ok(!html.includes('destination='), 'chưa có tọa độ thì không có link chỉ đường');
    assert.match(html, /Chưa chọn vị trí/);
  });
  it('có tọa độ ban đầu: ô được điền, nút Xác nhận dùng được, link Chỉ đường đúng dạng vĩ độ trước', () => {
    const html = renderToStaticMarkup(
      <LocationPickerModal isOpen onClose={noop} onSave={noop} initialLat={16.0544} initialLng={108.2022} />,
    );
    assert.match(html, /id="location-picker-lat"[^>]*value="16.0544"/);
    assert.match(html, /id="location-picker-lng"[^>]*value="108.2022"/);
    assert.ok(html.includes('https://www.google.com/maps/dir/?api=1&amp;destination=16.0544,108.2022'));
    const saveBtn = html.match(/<button[^>]*location-picker-btn save[^>]*>/)?.[0] ?? '';
    assert.ok(saveBtn && !saveBtn.includes('disabled'), saveBtn);
  });
  it('tọa độ ban đầu (0,0) hoặc null coi như chưa có', () => {
    const html = renderToStaticMarkup(
      <LocationPickerModal isOpen onClose={noop} onSave={noop} initialLat={0} initialLng={0} />,
    );
    assert.match(html, /id="location-picker-lat"[^>]*value=""/);
  });
  it('có nút Phóng to / Thu nhỏ / Bản đồ chữ rõ ràng; đóng hộp thì không dựng gì', () => {
    const html = renderToStaticMarkup(<LocationPickerModal isOpen onClose={noop} onSave={noop} />);
    assert.ok(html.includes('Phóng to') && html.includes('Thu nhỏ'));
    assert.equal(renderToStaticMarkup(<LocationPickerModal isOpen={false} onClose={noop} />), '');
  });
});

describe('không còn Leaflet / tọa độ mặc định trong hộp chọn', () => {
  it('LocationPickerModal.tsx không import leaflet và không chứa tọa độ mặc định cũ', () => {
    const src = readFileSync(join(root, 'src/components/common/LocationPickerModal.tsx'), 'utf8');
    assert.ok(!/leaflet/i.test(src));
    assert.ok(!src.includes('15.8893') && !src.includes('108.2392'));
  });
});
