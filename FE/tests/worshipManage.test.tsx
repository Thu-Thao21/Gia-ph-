import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import apiClient from '../src/api/axios';
import {
  MAX_BULK_TABLETS,
  WorshipApiError,
  bulkAddTablets,
  fetchCandidates,
  updateHall,
  uploadTabletPortrait,
  type HallResponse,
} from '../src/services/worshipHall.service';
import { ManageEntryButton, ManagePanelHost } from '../src/components/member/worshipManage/WorshipManageEntry';
import { AddTab } from '../src/components/member/worshipManage/AddTab';
import { BlessingsTab } from '../src/components/member/worshipManage/BlessingsTab';
import { ImagesTab } from '../src/components/member/worshipManage/ImagesTab';
import type { ManageCtx } from '../src/components/member/worshipManage/ManageShared';
import { SettingsTab } from '../src/components/member/worshipManage/SettingsTab';
import { TabletsTab } from '../src/components/member/worshipManage/TabletsTab';
import { TiersTab } from '../src/components/member/worshipManage/TiersTab';
import { describeManageError } from '../src/components/member/worshipManage/manageErrors';
import { moveItem, toggleSelection } from '../src/components/member/worshipManage/manageLogic';
import {
  COVER_ASPECT,
  PORTRAIT_ASPECT,
  computeCropRect,
  cropFrameSize,
  cropToBlob,
  outputSize,
  validateImageFile,
  validateImageSize,
  type CanvasLike,
} from '../src/components/member/worshipManage/imageTools';
import { createDemoAdapter, createDemoBackend } from '../src/components/member/worshipManage/worshipDemo';

// Test được gói vào thư mục tạm; run.mjs đặt cwd là thư mục FE nên đọc mã nguồn theo cwd.
const root = process.cwd();
const CLAN = 'clan-1';
const BASE = `/families/${CLAN}/worship`;

/* ------------------------------------------------------------------ */
/* Adapter axios giả: ghi lại request, trả lời theo kịch bản (không có mạng thật) */
/* ------------------------------------------------------------------ */

type Responder = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown } | 'network';

function fakeAdapter(responder: Responder) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const reply = responder(config);
    if (reply === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
    const response = { data: reply.data ?? {}, status: reply.status, statusText: String(reply.status), headers: {}, config, request: {} };
    if (reply.status >= 400) throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response);
    return response;
  };
  return { adapter, calls };
}

const errorBody = (code: string, message: string) => ({ error: { code, message, request_id: 'req-1' } });

let savedAdapter: typeof apiClient.defaults.adapter;
beforeEach(() => {
  savedAdapter = apiClient.defaults.adapter;
});
afterEach(() => {
  apiClient.defaults.adapter = savedAdapter;
});

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('Lẽ ra phải bị từ chối');
};

/* ------------------------------------------------------------------ */
/* 1. Ẩn nút / panel khi canManage = false                              */
/* ------------------------------------------------------------------ */

describe('Nút và panel Quản lý bàn thờ', () => {
  const hall = { hall: { id: 'h' }, tiers: [], canManage: false } as unknown as HallResponse;
  const noop = () => undefined;
  const changed = async () => hall;

  it('canManage = false: không có nút, không có panel, không có DOM nào', () => {
    assert.equal(renderToStaticMarkup(<ManageEntryButton canManage={false} onOpen={noop} />), '');
    // Dù `open` bị bật nhầm, panel vẫn không dựng khi không có quyền.
    assert.equal(
      renderToStaticMarkup(<ManagePanelHost canManage={false} open clanId={CLAN} hall={hall} onChanged={changed} onClose={noop} />),
      ''
    );
  });

  it('canManage = true: có nút "Quản lý bàn thờ"', () => {
    const html = renderToStaticMarkup(<ManageEntryButton canManage onOpen={noop} />);
    assert.match(html, /Quản lý bàn thờ/);
    assert.match(html, /<button/);
  });

  it('có quyền nhưng chưa mở thì chưa dựng panel', () => {
    assert.equal(
      renderToStaticMarkup(<ManagePanelHost canManage open={false} clanId={CLAN} hall={hall} onChanged={changed} onClose={noop} />),
      ''
    );
  });

  it('trang chỉ cấp quyền từ GET hall (canManage) và nối nút vào đó', () => {
    const page = readFileSync(join(root, 'src/components/member/DigitalAncestralHallModule.tsx'), 'utf8');
    assert.match(page, /const canManage = !!hall\?\.canManage;/);
    assert.match(page, /<ManageEntryButton canManage=\{canManage\}/);
    assert.match(page, /<ManagePanelHost\s+canManage=\{canManage\}/);
  });

  it('chế độ minh họa chỉ được nạp trong nhánh import.meta.env.DEV (không vào bản build)', () => {
    const page = readFileSync(join(root, 'src/components/member/DigitalAncestralHallModule.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const gate = page.indexOf("import.meta.env.DEV && isDemo) {\n      // Chế độ minh họa");
    const load = page.indexOf("import('./worshipManage/worshipDemo')");
    assert.ok(gate > 0 && load > gate, 'import() của worshipDemo phải nằm sau điều kiện import.meta.env.DEV');
    assert.equal(page.match(/import\('\.\/worshipManage\/worshipDemo'\)/g)?.length, 1, 'chỉ một import() động');
    assert.doesNotMatch(page, /from '\.\/worshipManage\/worshipDemo'/, 'không được import tĩnh worshipDemo');
  });
});

/* ------------------------------------------------------------------ */
/* 2. Thêm bulk                                                         */
/* ------------------------------------------------------------------ */

describe('Thêm bài vị hàng loạt (POST tablets/bulk)', () => {
  it('gửi đúng đường dẫn và trường personIds, trả về added / skipped', async () => {
    const { adapter, calls } = fakeAdapter(() => ({
      status: 200,
      data: {
        added: [{ id: 't1', personId: 'p1', fullName: 'A' }],
        skipped: [{ personId: 'p2', reason: 'ALREADY_EXISTS', message: 'Đã có bài vị.' }],
      },
    }));
    apiClient.defaults.adapter = adapter;
    const res = await bulkAddTablets(CLAN, ['p1', 'p2']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'post');
    assert.equal(calls[0].url, `${BASE}/tablets/bulk`);
    assert.deepEqual(JSON.parse(String(calls[0].data)), { personIds: ['p1', 'p2'] });
    assert.equal(res.added.length, 1);
    assert.equal(res.skipped[0].reason, 'ALREADY_EXISTS');
  });

  it('gửi kèm tierId khi chọn tầng', async () => {
    const { adapter, calls } = fakeAdapter(() => ({ status: 200, data: { added: [], skipped: [] } }));
    apiClient.defaults.adapter = adapter;
    await bulkAddTablets(CLAN, ['p1'], 'tier-9');
    assert.deepEqual(JSON.parse(String(calls[0].data)), { personIds: ['p1'], tierId: 'tier-9' });
  });

  it('đúng 50 người được gửi; 51 hoặc 0 bị từ chối ngay ở FE, không gọi mạng', async () => {
    const { adapter, calls } = fakeAdapter(() => ({ status: 200, data: { added: [], skipped: [] } }));
    apiClient.defaults.adapter = adapter;
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    await bulkAddTablets(CLAN, ids(MAX_BULK_TABLETS));
    assert.equal(calls.length, 1);
    for (const n of [MAX_BULK_TABLETS + 1, 0]) {
      const err = await rejectionOf(bulkAddTablets(CLAN, ids(n)));
      assert.ok(err instanceof WorshipApiError);
      assert.equal(err.status, 422);
      assert.match(describeManageError(err).message, /1 đến 50/);
    }
    assert.equal(calls.length, 1, 'không có request nào được gửi thêm');
  });

  it('chọn tối đa 50 người trong danh sách ứng viên', () => {
    let selected: string[] = [];
    for (let i = 0; i < MAX_BULK_TABLETS; i += 1) selected = toggleSelection(selected, `p${i}`).selected;
    assert.equal(selected.length, 50);
    const over = toggleSelection(selected, 'p-extra');
    assert.equal(over.selected.length, 50);
    assert.equal(over.limitReached, true);
    const off = toggleSelection(selected, 'p0'); // bỏ chọn luôn được
    assert.equal(off.selected.length, 49);
    assert.equal(off.limitReached, false);
  });

  it('GET candidates gửi search đã cắt, limit và offset', async () => {
    const { adapter, calls } = fakeAdapter(() => ({ status: 200, data: { items: [], total: 0, offset: 0, limit: 20 } }));
    apiClient.defaults.adapter = adapter;
    await fetchCandidates(CLAN, { search: `  ${'a'.repeat(150)}  `, limit: 20, offset: 40 });
    assert.equal(calls[0].url, `${BASE}/candidates`);
    assert.deepEqual(calls[0].params, { search: 'a'.repeat(100), generation: undefined, limit: 20, offset: 40 });
  });

  it('backend giả: thêm lượt hai báo bỏ qua người đã có bài vị, không mất người khác', async () => {
    const backend = createDemoBackend(demoSeed());
    apiClient.defaults.adapter = createDemoAdapter(backend, (async () => assert.fail('không được gọi mạng')) as AxiosAdapter, 0);
    const first = await bulkAddTablets(CLAN, ['cand-1', 'cand-2']);
    assert.equal(first.added.length, 2);
    const second = await bulkAddTablets(CLAN, ['cand-1', 'cand-3']);
    assert.deepEqual(second.skipped.map((s) => [s.personId, s.reason]), [['cand-1', 'ALREADY_EXISTS']]);
    assert.equal(second.added.length, 1);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Lỗi 401 / 403 / 409 / 422 / mạng                                  */
/* ------------------------------------------------------------------ */

describe('Thông báo lỗi tiếng Việt theo mã của BE', () => {
  const failWith = async (reply: ReturnType<Responder>) => {
    apiClient.defaults.adapter = fakeAdapter(() => reply).adapter;
    return describeManageError(await rejectionOf(updateHall(CLAN, { title: 'x' })));
  };

  it('403: nói rõ chỉ Trưởng tộc / Quản trị hệ thống, không lộ thông báo thô', async () => {
    const info = await failWith({ status: 403, data: errorBody('FORBIDDEN', 'Forbidden.') });
    assert.match(info.message, /Chỉ Trưởng tộc hoặc Quản trị hệ thống/);
    assert.doesNotMatch(info.message, /Forbidden/);
    assert.equal(info.status, 403);
    assert.equal(info.needsRelogin, false);
  });

  it('422: dùng thông báo tiếng Việt của BE; thông báo tiếng Anh mặc định thì thay bằng câu chung', async () => {
    const vn = await failWith({ status: 422, data: errorBody('VALIDATION_ERROR', 'Phòng thờ đã đủ 300 bài vị.') });
    assert.equal(vn.message, 'Phòng thờ đã đủ 300 bài vị.');
    const en = await failWith({ status: 422, data: errorBody('VALIDATION_ERROR', 'Invalid input.') });
    assert.match(en.message, /Dữ liệu chưa hợp lệ/);
    assert.doesNotMatch(en.message, /Invalid input/);
  });

  it('401: yêu cầu đăng nhập lại', async () => {
    const info = await failWith({ status: 401, data: errorBody('UNAUTHENTICATED', 'Not authenticated') });
    assert.equal(info.needsRelogin, true);
    assert.match(info.message, /đăng nhập lại/);
  });

  it('409: trùng bài vị / xung đột đều báo tiếng Việt và yêu cầu tải lại', async () => {
    const dup = await failWith({ status: 409, data: errorBody('DUPLICATE_RESOURCE', 'Duplicate') });
    assert.equal(dup.message, 'Bài vị này đã có trong phòng thờ.');
    assert.equal(dup.shouldReload, true);
    const conflict = await failWith({ status: 409, data: errorBody('STATE_CONFLICT', 'Conflict.') });
    assert.match(conflict.message, /xung đột/);
    assert.equal(conflict.shouldReload, true);
    const keep = await failWith({ status: 409, data: errorBody('STATE_CONFLICT', 'Tầng này còn 3 bài vị. Hãy chuyển sang tầng khác.') });
    assert.match(keep.message, /Tầng này còn 3 bài vị/);
  });

  it('mạng: không có phản hồi', async () => {
    const info = await failWith('network');
    assert.equal(info.isNetwork, true);
    assert.match(info.message, /Không kết nối được máy chủ/);
  });

  it('404 tải lại; 413 / 429 / 500 có câu riêng, không bao giờ hiện lỗi thô', async () => {
    assert.equal((await failWith({ status: 404, data: errorBody('NOT_FOUND', 'Not found') })).shouldReload, true);
    assert.match((await failWith({ status: 413, data: {} })).message, /5 MB/);
    assert.match((await failWith({ status: 429, data: errorBody('RATE_LIMITED', 'Too many') })).message, /quá nhanh/);
    const server = await failWith({ status: 500, data: errorBody('INTERNAL_ERROR', 'Traceback: boom') });
    assert.match(server.message, /Máy chủ đang gặp sự cố/);
    assert.doesNotMatch(server.message, /Traceback|boom/);
  });

  it('lỗi lạ (không phải lỗi axios) cũng không lộ thông báo thô', () => {
    const info = describeManageError(new Error('TypeError: x is undefined'));
    assert.doesNotMatch(info.message, /TypeError|undefined/);
  });

  it('backend giả với ?demoFail=403 trả đúng 403 cho thao tác ghi, nhưng vẫn cho đọc', async () => {
    const backend = createDemoBackend(demoSeed(), { failWith: '403' });
    apiClient.defaults.adapter = createDemoAdapter(backend, (async () => assert.fail('không được gọi mạng')) as AxiosAdapter, 0);
    const info = describeManageError(await rejectionOf(updateHall(CLAN, { portraitGrayscale: true })));
    assert.equal(info.status, 403);
    const read = await fetchCandidates(CLAN);
    assert.ok(read.items.length > 0);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Cắt ảnh                                                           */
/* ------------------------------------------------------------------ */

describe('Kiểm tra tệp ảnh', () => {
  it('nhận JPG, PNG, WebP', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      assert.equal(validateImageFile({ name: 'a', type, size: 1000 }), null, type);
    }
  });

  it('từ chối loại khác bằng thông báo tiếng Việt', () => {
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain']) {
      assert.match(validateImageFile({ name: 'a', type, size: 1000 }) || '', /JPG, PNG hoặc WebP/, type);
    }
  });

  it('dung lượng: đúng 5 MB được nhận, vượt 5 MB bị từ chối và nói rõ dung lượng', () => {
    const five = 5 * 1024 * 1024;
    assert.equal(validateImageFile({ type: 'image/jpeg', size: five }), null);
    const message = validateImageFile({ type: 'image/jpeg', size: five + 1 }) || '';
    assert.match(message, /vượt mức tối đa 5 MB/);
    assert.match(validateImageFile({ type: 'image/png', size: 7.5 * 1024 * 1024 }) || '', /7,5 MB/);
  });

  it('tệp rỗng bị từ chối; không có MIME thì xét đuôi tệp', () => {
    assert.match(validateImageFile({ type: 'image/png', size: 0 }) || '', /rỗng/);
    assert.equal(validateImageFile({ name: 'anh.JPG', type: '', size: 10 }), null);
    assert.notEqual(validateImageFile({ name: 'anh.gif', type: '', size: 10 }), null);
    assert.notEqual(validateImageFile({ name: 'anh', type: '', size: 10 }), null);
  });

  it('ảnh quá nhỏ hoặc không đọc được', () => {
    assert.match(validateImageSize(60, 800) || '', /quá nhỏ/);
    assert.match(validateImageSize(0, 0) || '', /Không đọc được/);
    assert.equal(validateImageSize(100, 100), null);
  });
});

describe('Cắt ảnh theo khung ảnh thờ (canvas)', () => {
  it('khung đúng tỉ lệ 3:4 và nằm gọn trong ảnh dù kéo ra ngoài', () => {
    const W = 4000;
    const H = 3000;
    for (const [cx, cy] of [[-500, -500], [0, 0], [2000, 1500], [9000, 9000], [W, H]]) {
      for (const zoom of [1, 1.7, 4]) {
        const r = computeCropRect(W, H, PORTRAIT_ASPECT, zoom, cx, cy);
        assert.ok(r.sx >= 0 && r.sy >= 0, 'không âm');
        assert.ok(r.sx + r.sw <= W + 1e-6 && r.sy + r.sh <= H + 1e-6, 'không tràn ra ngoài ảnh');
        assert.ok(Math.abs(r.sw / r.sh - PORTRAIT_ASPECT) < 1e-9, 'đúng tỉ lệ 3:4');
      }
    }
  });

  it('thu phóng: zoom 2 thu khung còn một nửa; zoom bị kẹp trong 1..4', () => {
    const base = cropFrameSize(4000, 3000, PORTRAIT_ASPECT, 1);
    assert.equal(base.sh, 3000); // ảnh ngang: khung cao bằng ảnh
    assert.equal(base.sw, 2250);
    assert.equal(cropFrameSize(4000, 3000, PORTRAIT_ASPECT, 2).sw, 1125);
    assert.equal(cropFrameSize(4000, 3000, PORTRAIT_ASPECT, 99).sw, cropFrameSize(4000, 3000, PORTRAIT_ASPECT, 4).sw);
    assert.equal(cropFrameSize(4000, 3000, PORTRAIT_ASPECT, 0.1).sw, 2250);
    // ảnh dọc hẹp: khung rộng bằng ảnh
    assert.equal(cropFrameSize(600, 1600, PORTRAIT_ASPECT, 1).sw, 600);
  });

  it('khung kéo đến mép thì dừng ở mép', () => {
    const r = computeCropRect(4000, 3000, PORTRAIT_ASPECT, 1, 99999, 1500);
    assert.equal(r.sx, 4000 - r.sw);
    assert.equal(computeCropRect(4000, 3000, PORTRAIT_ASPECT, 1, -99999, 1500).sx, 0);
  });

  it('kích thước đầu ra: 600×800 cho ảnh lớn, không phóng to ảnh nhỏ, luôn trong giới hạn BE', () => {
    assert.deepEqual(outputSize({ sx: 0, sy: 0, sw: 2250, sh: 3000 }, PORTRAIT_ASPECT, 600), { width: 600, height: 800 });
    assert.deepEqual(outputSize({ sx: 0, sy: 0, sw: 300, sh: 400 }, PORTRAIT_ASPECT, 600), { width: 300, height: 400 });
    const cover = outputSize({ sx: 0, sy: 0, sw: 9000, sh: 5000 }, COVER_ASPECT, 1600);
    assert.deepEqual(cover, { width: 1600, height: 900 });
    const tiny = outputSize({ sx: 0, sy: 0, sw: 3, sh: 4 }, PORTRAIT_ASPECT, 600);
    assert.ok(tiny.width >= 16 && tiny.height >= 16);
  });

  const fakeCanvas = (blobOrNull: Blob | null = new Blob(['x'], { type: 'image/jpeg' }), ctxNull = false) => {
    const drawn: unknown[][] = [];
    const fills: unknown[][] = [];
    const canvas: CanvasLike & { asked?: { type?: string; quality?: number } } = {
      width: 0,
      height: 0,
      getContext: () =>
        ctxNull
          ? null
          : {
              fillStyle: '',
              fillRect: (...a: number[]) => { fills.push(a); },
              drawImage: (...a: unknown[]) => { drawn.push(a); },
            },
      toBlob(cb, type, quality) {
        canvas.asked = { type, quality };
        cb(blobOrNull ? new Blob([blobOrNull], { type: type || 'image/jpeg' }) : null);
      },
    };
    return { canvas, drawn, fills };
  };

  it('cắt bằng canvas: vẽ đúng vùng nguồn ra đúng kích thước, nền trắng, xuất JPEG', async () => {
    const { canvas, drawn, fills } = fakeCanvas();
    const source = { tag: 'image' };
    const rect = { sx: 100, sy: 50, sw: 2250, sh: 3000 };
    const blob = await cropToBlob(source, rect, { width: 600, height: 800 }, () => canvas);
    assert.equal(canvas.width, 600);
    assert.equal(canvas.height, 800);
    assert.deepEqual(drawn, [[source, 100, 50, 2250, 3000, 0, 0, 600, 800]]);
    assert.deepEqual(fills, [[0, 0, 600, 800]]);
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(canvas.asked?.type, 'image/jpeg');
  });

  it('cắt thất bại (không có canvas 2D, toBlob rỗng) thì báo lỗi tiếng Việt', async () => {
    const noCtx = fakeCanvas(undefined, true);
    await assert.rejects(cropToBlob({}, { sx: 0, sy: 0, sw: 10, sh: 10 }, { width: 10, height: 10 }, () => noCtx.canvas), /Trình duyệt không hỗ trợ cắt ảnh/);
    const noBlob = fakeCanvas(null);
    await assert.rejects(cropToBlob({}, { sx: 0, sy: 0, sw: 10, sh: 10 }, { width: 10, height: 10 }, () => noBlob.canvas), /Không cắt được ảnh/);
  });

  it('ảnh sau khi cắt được gửi lên dạng multipart, trường "file"', async () => {
    const { adapter, calls } = fakeAdapter(() => ({ status: 200, data: { portraitUrl: '/families/clan-1/worship/images/x.jpg' } }));
    apiClient.defaults.adapter = adapter;
    const cropped = await cropToBlob({}, { sx: 0, sy: 0, sw: 30, sh: 40 }, { width: 30, height: 40 }, () => fakeCanvas(new Blob(['jpegdata'])).canvas);
    const res = await uploadTabletPortrait(CLAN, 't1', cropped);
    assert.equal(res.portraitUrl, '/families/clan-1/worship/images/x.jpg');
    assert.equal(calls[0].url, `${BASE}/tablets/t1/portrait`);
    assert.ok(calls[0].data instanceof FormData);
    const file = (calls[0].data as FormData).get('file');
    assert.ok(file instanceof Blob && file.size === 'jpegdata'.length);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Backend giả của chế độ minh họa                                   */
/* ------------------------------------------------------------------ */

function demoSeed(): HallResponse {
  const tablet = (id: string, tierId: string, order: number) => ({
    id, personId: id, fullName: `Cụ ${id}`, generation: 1, birthYear: 1900, deathYear: 1970, birthDate: '1900', deathDate: '1970',
    portraitUrl: null, thumbnailUrl: null, note: null, displayOrder: order, tierId, isVisible: true,
  });
  return {
    hall: { id: 'h', title: 'Phòng thờ', clanName: 'Dòng họ', visibility: 'PUBLIC', blessingsEnabled: true, coverImageUrl: null, portraitGrayscale: false },
    tiers: [
      { tierId: 'T1', tierNo: 1, title: 'Đời 1', total: 2, tablets: [tablet('a', 'T1', 0), tablet('b', 'T1', 1)] },
      { tierId: 'T2', tierNo: 2, title: 'Đời 2', total: 0, tablets: [] },
    ],
    today: { incenseCount: 0, blessingCount: 0 },
    me: null,
    canManage: true,
  };
}

describe('Backend giả của ?demo=1', () => {
  const use = () => {
    const backend = createDemoBackend(demoSeed());
    apiClient.defaults.adapter = createDemoAdapter(backend, (async () => assert.fail('không được gọi mạng thật')) as AxiosAdapter, 0);
  };
  const get = async <T,>(path: string) => (await apiClient.get<T>(`${BASE}/${path}`)).data;

  it('GET hall báo canManage = true và có portraitGrayscale', async () => {
    use();
    const hall = await get<HallResponse>('hall');
    assert.equal(hall.canManage, true);
    assert.equal(hall.hall.portraitGrayscale, false);
    assert.equal(hall.tiers.length, 2);
  });

  it('bật ảnh đen trắng và đổi tiêu đề rồi GET lại thấy đổi; tiêu đề rỗng bị 422', async () => {
    use();
    await updateHall(CLAN, { portraitGrayscale: true, title: 'Từ đường' });
    const hall = await get<HallResponse>('hall');
    assert.equal(hall.hall.portraitGrayscale, true);
    assert.equal(hall.hall.title, 'Từ đường');
    assert.equal(describeManageError(await rejectionOf(updateHall(CLAN, { title: '   ' }))).status, 422);
  });

  it('xóa tầng còn bài vị mà không chọn nơi chuyển đến thì 409; chuyển đi thì xóa được', async () => {
    use();
    const conflict = await rejectionOf(apiClient.delete(`${BASE}/tiers/T1`));
    assert.equal((conflict as AxiosError).response?.status, 409);
    await apiClient.delete(`${BASE}/tiers/T1`, { params: { moveToTierId: 'T2' } });
    const hall = await get<HallResponse>('hall');
    assert.deepEqual(hall.tiers.map((t) => [t.tierId, t.total]), [['T2', 2]]);
  });

  it('đổi thứ tự bài vị và chuyển tầng', async () => {
    use();
    await apiClient.put(`${BASE}/tablets/reorder`, { orderedIds: ['b', 'a'] });
    assert.deepEqual((await get<{ tablets: Array<{ id: string }> }>('tiers/T1/tablets')).tablets.map((t) => t.id), ['b', 'a']);
    await apiClient.patch(`${BASE}/tablets/a`, { tierId: 'T2' });
    const hall = await get<HallResponse>('hall');
    assert.deepEqual(hall.tiers.map((t) => [t.tierId, t.total]), [['T1', 1], ['T2', 1]]);
  });

  it('tải ảnh quá 5MB hoặc sai loại thì 422 tiếng Việt', async () => {
    use();
    const send = (blob: Blob) => uploadTabletPortrait(CLAN, 'a', blob); // qua service: có header multipart
    // ảnh hợp lệ thì được nhận và có URL mới
    const okRes = await send(new Blob(['x'], { type: 'image/jpeg' }));
    assert.ok(okRes.portraitUrl);
    const big = describeManageError(await rejectionOf(send(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))));
    assert.match(big.message, /5MB/);
    const gif = describeManageError(await rejectionOf(send(new Blob(['x'], { type: 'image/gif' }))));
    assert.match(gif.message, /JPG, PNG hoặc WebP/);
  });

  it('ẩn và xóa lời viếng làm lời viếng biến khỏi danh sách', async () => {
    use();
    const before = await get<{ items: Array<{ id: string }> }>('blessings');
    assert.ok(before.items.length >= 2);
    await apiClient.patch(`${BASE}/blessings/${before.items[0].id}/hide`);
    await apiClient.delete(`${BASE}/blessings/${before.items[1].id}`);
    const after = await get<{ items: Array<{ id: string }> }>('blessings');
    assert.equal(after.items.length, before.items.length - 2);
  });

  it('URL ngoài /worship/ đi qua adapter gốc, /worship/ thì không', async () => {
    const backend = createDemoBackend(demoSeed());
    const passthrough = fakeAdapter(() => ({ status: 200, data: { ok: true } }));
    apiClient.defaults.adapter = createDemoAdapter(backend, passthrough.adapter, 0);
    await apiClient.get('/auth/me');
    await apiClient.get(`${BASE}/hall`);
    assert.deepEqual(passthrough.calls.map((c) => c.url), ['/auth/me']);
  });
});

describe('Dựng các tab (render tĩnh, không lỗi, đủ nút)', () => {
  const seed = demoSeed();
  const tablets = seed.tiers.flatMap((t) => t.tablets);
  tablets[1] = { ...tablets[1], isVisible: false, note: 'Ghi chú thử' };
  const tiers = seed.tiers.map((t) => ({ tierId: t.tierId, tierNo: t.tierNo, title: t.title, total: t.total }));
  const baseCtx = (over: Partial<ManageCtx> = {}): ManageCtx => ({
    clanId: CLAN,
    hall: { ...seed, hall: { ...seed.hall, portraitGrayscale: true } },
    tiers,
    tablets,
    tabletsLoading: false,
    busyKey: null,
    errorMessage: null,
    clearError: () => undefined,
    run: async () => undefined,
    reportError: () => undefined,
    notify: () => undefined,
    lockClose: () => undefined,
    ...over,
  });

  it('tab Bài vị: tên, ngày mất, tầng, nút Sửa ghi chú / Ẩn / Hiện / Xóa; bài vị ẩn được đánh dấu', () => {
    const html = renderToStaticMarkup(<TabletsTab ctx={baseCtx()} />);
    assert.match(html, /Cụ a/);
    assert.match(html, /Mất: 1970/);
    assert.match(html, /Tầng 1 · Đời 1/);
    assert.match(html, /Sửa ghi chú/);
    assert.match(html, /Đang ẩn/);
    assert.match(html, />Hiện</);
    assert.match(html, />Ẩn</);
    assert.match(html, />Xóa</);
    assert.doesNotMatch(html, /Xác nhận xóa/, 'chưa bấm Xóa thì chưa hiện bước xác nhận');
  });

  it('tab Bài vị: danh sách rỗng và đang tải', () => {
    assert.match(renderToStaticMarkup(<TabletsTab ctx={baseCtx({ tablets: [] })} />), /Chưa có bài vị nào/);
    assert.match(renderToStaticMarkup(<TabletsTab ctx={baseCtx({ tablets: [], tabletsLoading: true })} />), /Đang tải/);
  });

  it('tab Tầng: đủ 6 ô, ô trống có nút tạo tầng, ô đã có có nút lên/xuống/xóa', () => {
    const html = renderToStaticMarkup(<TiersTab ctx={baseCtx()} />);
    for (const n of [1, 2, 3, 4, 5, 6]) assert.match(html, new RegExp(`Tầng ${n}`));
    assert.match(html, /Tạo tầng 3/);
    assert.match(html, /Tạo tầng 6/);
    assert.doesNotMatch(html, /Tạo tầng 1</);
    assert.match(html, /Đưa tầng 1 lên trên/);
    assert.match(html, /Đưa tầng 2 xuống dưới/);
    assert.match(html, /Xóa tầng/);
    assert.match(html, /Đổi tên/);
  });

  it('tab Cài đặt: công tắc ảnh đen trắng phản ánh portraitGrayscale; tắt/bật lời viếng', () => {
    const on = renderToStaticMarkup(<SettingsTab ctx={baseCtx()} />);
    assert.match(on, /Ảnh thờ đen trắng/);
    assert.match(on, /role="switch"[^>]*aria-checked="true"/);
    assert.match(on, /Cho phép viết lời viếng/);
    assert.match(on, /Tiêu đề phòng thờ/);
    const off = renderToStaticMarkup(
      <SettingsTab ctx={baseCtx({ hall: { ...seed, hall: { ...seed.hall, portraitGrayscale: false, blessingsEnabled: false } } })} />
    );
    assert.equal((off.match(/aria-checked="false"/g) || []).length, 2);
  });

  it('tab Ảnh: ảnh bìa, danh sách bài vị, ô chọn tệp chỉ nhận JPG/PNG/WebP, nhắc giới hạn 5 MB', () => {
    const html = renderToStaticMarkup(<ImagesTab ctx={baseCtx()} />);
    assert.match(html, /Ảnh bìa phòng thờ/);
    assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(html, /tối đa 5 MB/);
    assert.match(html, /Tải ảnh bìa/);
    assert.match(html, /Cụ b/);
  });

  it('tab Thêm bài vị và Lời viếng dựng được (dữ liệu tải sau khi mở)', () => {
    const add = renderToStaticMarkup(<AddTab ctx={baseCtx()} />);
    assert.match(add, /Tìm theo tên/);
    assert.match(add, /Đã chọn <b>0<\/b>\/50/);
    assert.match(add, /Tự xếp theo đời/);
    assert.match(renderToStaticMarkup(<BlessingsTab ctx={baseCtx()} />), /Đang tải lời viếng/);
  });

  it('không dùng confirm()/alert() của trình duyệt trong màn hình quản lý', () => {
    const dir = join(root, 'src/components/member/worshipManage');
    const files = readdirSync(dir).filter((name) => /\.(tsx?|css)$/.test(name) && !name.includes('Demo'));
    assert.ok(files.length >= 10);
    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8');
      assert.doesNotMatch(text, /\b(window\.)?(confirm|alert|prompt)\(/, name);
    }
  });
});

describe('Đổi thứ tự bằng nút lên/xuống', () => {
  it('đổi chỗ với phần tử kế bên, không đổi khi ở biên, không sửa mảng gốc', () => {
    const list = ['a', 'b', 'c'];
    assert.deepEqual(moveItem(list, 1, -1), ['b', 'a', 'c']);
    assert.deepEqual(moveItem(list, 1, 1), ['a', 'c', 'b']);
    assert.deepEqual(moveItem(list, 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(moveItem(list, 2, 1), ['a', 'b', 'c']);
    assert.deepEqual(list, ['a', 'b', 'c']);
  });
});
