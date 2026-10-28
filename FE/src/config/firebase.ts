import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/*
 * Cấu hình Firebase của FE: CHỈ đọc từ biến VITE_FIREBASE_* (FE/.env), KHÔNG có giá trị dự phòng
 * nào trong mã nguồn. Thiếu biến thì báo lỗi cấu hình nêu tên biến, không im lặng dùng khóa khác.
 *
 * Từ Mốc M1/M4b FE không còn dùng Firebase (đăng nhập, đăng ký, quên mật khẩu đều qua BE), nên
 * hiện không màn hình nào gọi tới file này. Firebase chỉ được khởi tạo khi có code gọi
 * getFirebaseAuth(), không khởi tạo lúc import.
 */

const REQUIRED = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const;

export class FirebaseConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Thiếu cấu hình Firebase trong FE/.env: ${missing.join(', ')}.`);
    this.name = 'FirebaseConfigError';
  }
}

function readConfig() {
  const env = import.meta.env as Record<string, string | undefined>;
  const missing = Object.values(REQUIRED).filter((name) => !(env[name] || '').trim());
  if (missing.length > 0) throw new FirebaseConfigError(missing);
  return {
    apiKey: env.VITE_FIREBASE_API_KEY!.trim(),
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!.trim(),
    projectId: env.VITE_FIREBASE_PROJECT_ID!.trim(),
    appId: env.VITE_FIREBASE_APP_ID!.trim(),
    storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || undefined,
    messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || undefined,
  };
}

/** Firebase app, khởi tạo một lần khi được gọi lần đầu. Ném FirebaseConfigError nếu thiếu biến. */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(readConfig());
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
