// Chạy test của màn hình Quản lý bàn thờ: `npm test`.
// Không thêm thư viện: dùng esbuild (đã có sẵn cùng Vite) để gói file *.test.ts(x) rồi chạy bằng trình chạy test
// có sẵn của Node (`node --test`). Không có DOM: các thành phần React được dựng bằng react-dom/server,
// còn phần gọi API được thử bằng adapter axios giả (không có request mạng thật).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entries = readdirSync(here)
  .filter((name) => /\.test\.tsx?$/.test(name))
  .map((name) => join(here, name));
if (entries.length === 0) {
  console.error('Không tìm thấy file *.test.ts(x) trong tests/');
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'worship-fe-tests-'));
try {
  await build({
    entryPoints: entries,
    outdir: out,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    sourcemap: 'inline',
    logLevel: 'warning',
    absWorkingDir: resolve(here, '..'),
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ DEV: true, VITE_API_BASE_URL: 'http://test.invalid/api/v1' }) },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const files = readdirSync(out).filter((name) => name.endsWith('.mjs')).map((name) => join(out, name));
  const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: resolve(here, '..') });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
