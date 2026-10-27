export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  displayName: string;
  role?: 'admin' | 'member' | string;
  token?: string;
}

export interface RegisterPayload {
  username: string;
  emailOrPhone: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  role?: 'member' | string;
}

export interface LoginPayload {
  emailOrPhone: string;
  password: string;
  role?: 'admin' | 'member' | string;
}

export interface AuthResponse {
  user: AuthUser;
  message: string;
}

// ----- BE mới (MFGMS-AI), tên trường theo .be-ref/schemas/auth.py -----

export type BeUserStatus = 'PENDING' | 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED';
export type BeClanStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'LOCKED' | 'INACTIVE';
export type BeMembershipStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

/** user trong response của POST /auth/session. */
export interface SessionUser {
  user_id: string;
  display_name: string;
  email: string;
  status: BeUserStatus;
}

/** 201 của POST /auth/session. access_token chỉ trả một lần. */
export interface SessionCreateResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_at: string;
  user: SessionUser;
  requires_password_change: boolean;
}

/** Một dòng họ mà người dùng thuộc về, kèm vai trò và quyền trong dòng họ đó. */
export interface MembershipSummary {
  clan_id: string;
  clan_name: string;
  clan_status: BeClanStatus;
  membership_status: BeMembershipStatus;
  lineage_type?: 'PATERNAL' | 'MATERNAL' | string | null;
  person_id?: string | null;
  roles: string[];
  permissions: string[];
}

/** 200 của GET /auth/me. */
export interface MeResponse {
  user_id: string;
  display_name: string;
  status: BeUserStatus;
  memberships: MembershipSummary[];
  permissions: string[];
  requires_password_change: boolean;
}
