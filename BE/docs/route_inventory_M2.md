# Kiểm kê route (Mốc M2)

Sinh lại: `.venv\Scripts\python scripts\route_inventory.py` (cột Phân quyền: dependency require_action, hoặc kiểm tra trong thân handler). Allowlist public: `app/core/public_routes.py`; test: `tests/test_route_auth.py`.

## Trước M2 (route KHÔNG xác thực)

| Method | Path | Auth | Phân quyền | Public (allowlist) | Handler |
| GET | `/api/health` | **NO** | - |  | controllers.health.health |
| GET | `/api/health/ready` | **NO** | - |  | main.readiness |
| POST | `/api/v1/auth/login` | **NO** | - |  | controllers.auth_access.router.login |
| POST | `/api/v1/auth/register-public` | **NO** | - |  | controllers.auth_access.router.register_public |
| POST | `/api/v1/auth/register-send-otp` | **NO** | - |  | controllers.auth_access.router.register_send_otp |
| POST | `/api/v1/auth/register-verify-otp` | **NO** | - |  | controllers.auth_access.router.register_verify_otp |
| POST | `/api/v1/business-registrations` | **NO** | - |  | controllers.family_management.public_router.create_registration |
| POST | `/api/v1/business-registrations/send-otp` | **NO** | - |  | controllers.family_management.public_router.send_registration_otp |
| POST | `/api/v1/business-registrations/track` | **NO** | - |  | controllers.family_management.public_router.track_registration |
| POST | `/api/v1/business-registrations/verify-otp` | **NO** | - |  | controllers.family_management.public_router.verify_registration_otp |
| GET | `/api/v1/families` | **NO** | - |  | controllers.family_management.public_router.search_public_families |
| GET | `/api/v1/families/{family_id}/branches` | **NO** | - |  | controllers.member_api_router.list_family_branches |
| POST | `/api/v1/families/{family_id}/branches` | **NO** | - |  | controllers.member_api_router.create_family_branch |
| DELETE | `/api/v1/families/{family_id}/branches/{branch_id}` | **NO** | - |  | controllers.member_api_router.delete_family_branch |
| GET | `/api/v1/families/{family_id}/persons/export` | **NO** | - |  | controllers.genealogy.router.export_family_persons |
| GET | `/api/v1/families/{family_id}/profile` | **NO** | - |  | controllers.member_api_router.get_clan_profile |
| PUT | `/api/v1/families/{family_id}/profile` | **NO** | - |  | controllers.member_api_router.update_clan_profile |
| GET | `/api/v1/families/{family_id}/public-tree` | **NO** | genealogy-service |  | controllers.genealogy.router.get_public_tree |
| GET | `/api/v1/members` | **NO** | - |  | controllers.member_api_router.list_members |
| GET | `/api/v1/members/{member_id}` | **NO** | - |  | controllers.member_api_router.get_member_detail |
| GET | `/api/v1/persons/export` | **NO** | - |  | controllers.member_api_router.export_persons |
| GET | `/api/v1/public/families` | **NO** | - |  | controllers.family_management.public_router.search_public_families |
| GET | `/api/v1/service-plans` | **NO** | - |  | controllers.family_management.public_router.list_service_plans |
| POST | `/auth/login` | **NO** | - |  | controllers.auth_access.router.login |
| POST | `/auth/register-public` | **NO** | - |  | controllers.auth_access.router.register_public |
| POST | `/auth/register-send-otp` | **NO** | - |  | controllers.auth_access.router.register_send_otp |
| POST | `/auth/register-verify-otp` | **NO** | - |  | controllers.auth_access.router.register_verify_otp |
| POST | `/business-registrations` | **NO** | - |  | controllers.family_management.public_router.create_registration |
| POST | `/business-registrations/send-otp` | **NO** | - |  | controllers.family_management.public_router.send_registration_otp |
| POST | `/business-registrations/track` | **NO** | - |  | controllers.family_management.public_router.track_registration |
| POST | `/business-registrations/verify-otp` | **NO** | - |  | controllers.family_management.public_router.verify_registration_otp |
| GET | `/families` | **NO** | - |  | controllers.family_management.public_router.search_public_families |
| GET | `/families/{family_id}/branches` | **NO** | - |  | controllers.member_api_router.list_family_branches |
| POST | `/families/{family_id}/branches` | **NO** | - |  | controllers.member_api_router.create_family_branch |
| DELETE | `/families/{family_id}/branches/{branch_id}` | **NO** | - |  | controllers.member_api_router.delete_family_branch |
| GET | `/families/{family_id}/persons/export` | **NO** | - |  | controllers.member_api_router.export_persons |
| GET | `/families/{family_id}/profile` | **NO** | - |  | controllers.member_api_router.get_clan_profile |
| PUT | `/families/{family_id}/profile` | **NO** | - |  | controllers.member_api_router.update_clan_profile |
| GET | `/members` | **NO** | - |  | controllers.member_api_router.list_members |
| GET | `/members/{member_id}` | **NO** | - |  | controllers.member_api_router.get_member_detail |
| GET | `/persons/export` | **NO** | - |  | controllers.member_api_router.export_persons |
| GET | `/public/families` | **NO** | - |  | controllers.family_management.public_router.search_public_families |
| GET | `/service-plans` | **NO** | - |  | controllers.family_management.public_router.list_service_plans |

138 routes, 95 authenticated, 43 without authentication.

## Thay đổi ở M2b

- `inter_family` (12 route × 2 mount): thêm phân quyền theo clan (cột Phân quyền: `inter-family`).
  Không liên quan clan nào của tài nguyên → 404; trong clan nhưng thiếu `family.update` → 403; SA qua hết.
- Export (4 route): `person.update` (trước: `person.view`).
- OTP (4 route public): limiter theo IP `otp_send` (2 route gửi) và `otp_verify` (2 route xác minh),
  mỗi limiter đếm chung cho cả hai luồng và hai mount. Allowlist public KHÔNG đổi.

## Thay đổi ở M2c + M4

- `POST /auth/register-public`: limiter theo IP `register_public` (mặc định 5/giờ, chung 2 mount).
- MỚI `POST /auth/password-reset/confirm` (public, allowlist có lý do): quên mật khẩu bước 2;
  limiter `password_reset` (mọi lần gọi) + `password_reset_failures` (chỉ mã sai/hết hạn).
- `GET /networks/shared-tree/{clan}` (2 dạng URL): mọi trường của người qua policy `allowed_fields`
  của clan sở hữu; người còn sống bị che trừ khi policy có `living_persons: true`.

## Sau M2c + M4 (toàn bộ)

| Method | Path | Auth | Phân quyền | Public (allowlist) | Handler |
|---|---|---|---|---|---|
| GET | `/admin/business-registrations` | yes | require_action(registration.list) |  | controllers.family_management.registration_admin_router.list_registrations |
| GET | `/admin/business-registrations/{registration_id}` | yes | require_action(registration.read) |  | controllers.family_management.registration_admin_router.get_registration |
| POST | `/admin/business-registrations/{registration_id}/approve-and-provision` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.approve_and_provision |
| POST | `/admin/business-registrations/{registration_id}/business` | yes | require_action(business.create) |  | controllers.family_management.registration_admin_router.create_business |
| POST | `/admin/business-registrations/{registration_id}/review` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.review_registration |
| GET | `/admin/clans` | yes | require_action(clan.read) |  | controllers.family_management.clan_admin_router.list_clans |
| GET | `/admin/clans/{clan_id}` | yes | require_action(clan.read) |  | controllers.family_management.clan_admin_router.get_clan |
| POST | `/admin/clans/{clan_id}/activate` | yes | require_action(clan.activate) |  | controllers.family_management.clan_admin_router.activate_clan |
| POST | `/admin/clans/{clan_id}/owner` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.provision_owner |
| POST | `/admin/clans/{clan_id}/owner/temporary-password` | yes | require_action(clan.owner.temp_password.reset) |  | controllers.family_management.owner_admin_router.reissue_owner_temporary_password |
| GET | `/admin/provisioning-jobs` | yes | require_action(provisioning_job.read) |  | controllers.family_management.owner_admin_router.list_provisioning_jobs |
| GET | `/admin/provisioning-jobs/{job_id}` | yes | require_action(provisioning_job.read) |  | controllers.family_management.owner_admin_router.get_provisioning_job |
| POST | `/admin/provisioning-jobs/{job_id}/abandon` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.abandon_provisioning_job |
| POST | `/admin/provisioning-jobs/{job_id}/retry` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.retry_provisioning_job |
| GET | `/admin/service-plans` | yes | require_action(registration.list) |  | controllers.family_management.registration_admin_router.list_admin_service_plans |
| POST | `/admin/service-plans` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.create_admin_service_plan |
| DELETE | `/admin/service-plans/{plan_id}` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.delete_admin_service_plan |
| PUT | `/admin/service-plans/{plan_id}` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.update_admin_service_plan |
| PATCH | `/admin/service-plans/{plan_id}/status` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.toggle_admin_service_plan_status |
| GET | `/admin/stats` | yes | require_action(user.list) |  | controllers.auth_access.user_admin_router.get_admin_stats |
| GET | `/admin/users` | yes | require_action(user.list) |  | controllers.auth_access.user_admin_router.list_users |
| GET | `/admin/users/{user_id}` | yes | require_action(user.read) |  | controllers.auth_access.user_admin_router.get_user |
| PATCH | `/admin/users/{user_id}/status` | yes | require_action(user.status.update) |  | controllers.auth_access.user_admin_router.update_user_status |
| GET | `/api/health` | **NO** | - | public | controllers.health.health |
| GET | `/api/health/ready` | **NO** | - | public | main.readiness |
| GET | `/api/v1/admin/business-registrations` | yes | require_action(registration.list) |  | controllers.family_management.registration_admin_router.list_registrations |
| GET | `/api/v1/admin/business-registrations/{registration_id}` | yes | require_action(registration.read) |  | controllers.family_management.registration_admin_router.get_registration |
| POST | `/api/v1/admin/business-registrations/{registration_id}/approve-and-provision` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.approve_and_provision |
| POST | `/api/v1/admin/business-registrations/{registration_id}/business` | yes | require_action(business.create) |  | controllers.family_management.registration_admin_router.create_business |
| POST | `/api/v1/admin/business-registrations/{registration_id}/review` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.review_registration |
| GET | `/api/v1/admin/clans` | yes | require_action(clan.read) |  | controllers.family_management.clan_admin_router.list_clans |
| GET | `/api/v1/admin/clans/{clan_id}` | yes | require_action(clan.read) |  | controllers.family_management.clan_admin_router.get_clan |
| POST | `/api/v1/admin/clans/{clan_id}/activate` | yes | require_action(clan.activate) |  | controllers.family_management.clan_admin_router.activate_clan |
| POST | `/api/v1/admin/clans/{clan_id}/owner` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.provision_owner |
| POST | `/api/v1/admin/clans/{clan_id}/owner/temporary-password` | yes | require_action(clan.owner.temp_password.reset) |  | controllers.family_management.owner_admin_router.reissue_owner_temporary_password |
| GET | `/api/v1/admin/provisioning-jobs` | yes | require_action(provisioning_job.read) |  | controllers.family_management.owner_admin_router.list_provisioning_jobs |
| GET | `/api/v1/admin/provisioning-jobs/{job_id}` | yes | require_action(provisioning_job.read) |  | controllers.family_management.owner_admin_router.get_provisioning_job |
| POST | `/api/v1/admin/provisioning-jobs/{job_id}/abandon` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.abandon_provisioning_job |
| POST | `/api/v1/admin/provisioning-jobs/{job_id}/retry` | yes | require_action(clan.owner.provision) |  | controllers.family_management.owner_admin_router.retry_provisioning_job |
| GET | `/api/v1/admin/service-plans` | yes | require_action(registration.list) |  | controllers.family_management.registration_admin_router.list_admin_service_plans |
| POST | `/api/v1/admin/service-plans` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.create_admin_service_plan |
| DELETE | `/api/v1/admin/service-plans/{plan_id}` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.delete_admin_service_plan |
| PUT | `/api/v1/admin/service-plans/{plan_id}` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.update_admin_service_plan |
| PATCH | `/api/v1/admin/service-plans/{plan_id}/status` | yes | require_action(registration.review) |  | controllers.family_management.registration_admin_router.toggle_admin_service_plan_status |
| GET | `/api/v1/admin/stats` | yes | require_action(user.list) |  | controllers.auth_access.user_admin_router.get_admin_stats |
| GET | `/api/v1/admin/users` | yes | require_action(user.list) |  | controllers.auth_access.user_admin_router.list_users |
| GET | `/api/v1/admin/users/{user_id}` | yes | require_action(user.read) |  | controllers.auth_access.user_admin_router.get_user |
| PATCH | `/api/v1/admin/users/{user_id}/status` | yes | require_action(user.status.update) |  | controllers.auth_access.user_admin_router.update_user_status |
| POST | `/api/v1/auth/change-password` | yes | - |  | controllers.auth_access.router.change_password |
| POST | `/api/v1/auth/login` | **NO** | rate_limited(login) | public | controllers.auth_access.router.login |
| POST | `/api/v1/auth/logout` | yes | - |  | controllers.auth_access.router.logout |
| GET | `/api/v1/auth/me` | yes | - |  | controllers.auth_access.router.me |
| POST | `/api/v1/auth/password-reset/confirm` | **NO** | rate_limited(password_reset) | public | controllers.auth_access.router.confirm_password_reset |
| POST | `/api/v1/auth/register-public` | **NO** | rate_limited(register_public) | public | controllers.auth_access.router.register_public |
| POST | `/api/v1/auth/register-send-otp` | **NO** | rate_limited(otp_send) | public | controllers.auth_access.router.register_send_otp |
| POST | `/api/v1/auth/register-verify-otp` | **NO** | rate_limited(otp_verify) | public | controllers.auth_access.router.register_verify_otp |
| POST | `/api/v1/business-registrations` | **NO** | rate_limited(registration) | public | controllers.family_management.public_router.create_registration |
| POST | `/api/v1/business-registrations/send-otp` | **NO** | rate_limited(otp_send) | public | controllers.family_management.public_router.send_registration_otp |
| POST | `/api/v1/business-registrations/track` | **NO** | rate_limited(track) | public | controllers.family_management.public_router.track_registration |
| POST | `/api/v1/business-registrations/verify-otp` | **NO** | rate_limited(otp_verify) | public | controllers.family_management.public_router.verify_registration_otp |
| POST | `/api/v1/clans/{clan_id}/admins` | yes | require_action(clan.fa.assign) |  | controllers.auth_access.user_admin_router.assign_family_admin |
| DELETE | `/api/v1/clans/{clan_id}/admins/{user_id}` | yes | require_action(clan.fa.revoke) |  | controllers.auth_access.user_admin_router.revoke_family_admin |
| PUT | `/api/v1/clans/{clan_id}/admins/{user_id}/permissions` | yes | require_action(clan.fa_permissions.update) |  | controllers.auth_access.user_admin_router.update_fa_permissions |
| GET | `/api/v1/clans/{clan_id}/users` | yes | require_action(clan.users.list) |  | controllers.auth_access.user_admin_router.list_clan_users |
| GET | `/api/v1/families` | **NO** | - | public | controllers.family_management.public_router.search_public_families |
| GET | `/api/v1/families/{family_id}/branches` | yes | family-permission |  | controllers.member_api_router.list_family_branches |
| POST | `/api/v1/families/{family_id}/branches` | yes | family-permission |  | controllers.member_api_router.create_family_branch |
| DELETE | `/api/v1/families/{family_id}/branches/{branch_id}` | yes | family-permission |  | controllers.member_api_router.delete_family_branch |
| GET | `/api/v1/families/{family_id}/persons` | yes | genealogy-service |  | controllers.genealogy.router.search_persons |
| POST | `/api/v1/families/{family_id}/persons` | yes | genealogy-service |  | controllers.genealogy.router.create_person |
| GET | `/api/v1/families/{family_id}/persons/export` | yes | family-permission |  | controllers.genealogy.router.export_family_persons |
| GET | `/api/v1/families/{family_id}/persons/{person_id}` | yes | genealogy-service |  | controllers.genealogy.router.get_person |
| PATCH | `/api/v1/families/{family_id}/persons/{person_id}` | yes | genealogy-service |  | controllers.genealogy.router.update_person |
| GET | `/api/v1/families/{family_id}/persons/{person_id}/ancestors` | yes | genealogy-service |  | controllers.genealogy.router.get_ancestors |
| GET | `/api/v1/families/{family_id}/persons/{person_id}/descendants` | yes | genealogy-service |  | controllers.genealogy.router.get_descendants |
| GET | `/api/v1/families/{family_id}/persons/{person_id}/focus-view` | yes | genealogy-service |  | controllers.genealogy.router.get_focus_view |
| GET | `/api/v1/families/{family_id}/profile` | yes | family-permission |  | controllers.member_api_router.get_clan_profile |
| PUT | `/api/v1/families/{family_id}/profile` | yes | family-permission |  | controllers.member_api_router.update_clan_profile |
| GET | `/api/v1/families/{family_id}/public-tree` | **NO** | genealogy-service | public | controllers.genealogy.router.get_public_tree |
| GET | `/api/v1/families/{family_id}/relationship-path` | yes | genealogy-service |  | controllers.genealogy.router.calculate_relationship |
| POST | `/api/v1/families/{family_id}/relationships` | yes | genealogy-service |  | controllers.genealogy.router.create_relationship |
| DELETE | `/api/v1/families/{family_id}/relationships/{relationship_id}` | yes | genealogy-service |  | controllers.genealogy.router.delete_relationship |
| GET | `/api/v1/families/{family_id}/tree-data` | yes | genealogy-service |  | controllers.genealogy.router.get_tree_data |
| GET | `/api/v1/members` | yes | family-permission, system-admin |  | controllers.member_api_router.list_members |
| GET | `/api/v1/members/{member_id}` | yes | family-permission |  | controllers.member_api_router.get_member_detail |
| GET | `/api/v1/networks/diagram` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_network_diagram |
| GET | `/api/v1/networks/families` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_network_families |
| GET | `/api/v1/networks/families/{target_family_id}/shared-tree` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_shared_tree |
| GET | `/api/v1/networks/link-requests` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.list_link_requests |
| POST | `/api/v1/networks/link-requests` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.create_link_request |
| POST | `/api/v1/networks/link-requests/{request_id}/review` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.review_link_request |
| GET | `/api/v1/networks/links` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.list_inter_clan_links |
| DELETE | `/api/v1/networks/links/{link_id}` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.terminate_link |
| GET | `/api/v1/networks/links/{link_id}/policies` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_sharing_policies |
| PUT | `/api/v1/networks/links/{link_id}/policies` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.update_sharing_policy |
| POST | `/api/v1/networks/links/{link_id}/terminate` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.terminate_link |
| GET | `/api/v1/networks/shared-tree/{target_family_id}` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_shared_tree |
| GET | `/api/v1/persons/export` | yes | family-permission |  | controllers.member_api_router.export_persons |
| GET | `/api/v1/public/families` | **NO** | - | public | controllers.family_management.public_router.search_public_families |
| GET | `/api/v1/service-plans` | **NO** | - | public | controllers.family_management.public_router.list_service_plans |
| POST | `/auth/change-password` | yes | - |  | controllers.auth_access.router.change_password |
| POST | `/auth/login` | **NO** | rate_limited(login) | public | controllers.auth_access.router.login |
| POST | `/auth/logout` | yes | - |  | controllers.auth_access.router.logout |
| GET | `/auth/me` | yes | - |  | controllers.auth_access.router.me |
| POST | `/auth/password-reset/confirm` | **NO** | rate_limited(password_reset) | public | controllers.auth_access.router.confirm_password_reset |
| POST | `/auth/register-public` | **NO** | rate_limited(register_public) | public | controllers.auth_access.router.register_public |
| POST | `/auth/register-send-otp` | **NO** | rate_limited(otp_send) | public | controllers.auth_access.router.register_send_otp |
| POST | `/auth/register-verify-otp` | **NO** | rate_limited(otp_verify) | public | controllers.auth_access.router.register_verify_otp |
| POST | `/business-registrations` | **NO** | rate_limited(registration) | public | controllers.family_management.public_router.create_registration |
| POST | `/business-registrations/send-otp` | **NO** | rate_limited(otp_send) | public | controllers.family_management.public_router.send_registration_otp |
| POST | `/business-registrations/track` | **NO** | rate_limited(track) | public | controllers.family_management.public_router.track_registration |
| POST | `/business-registrations/verify-otp` | **NO** | rate_limited(otp_verify) | public | controllers.family_management.public_router.verify_registration_otp |
| POST | `/clans/{clan_id}/admins` | yes | require_action(clan.fa.assign) |  | controllers.auth_access.user_admin_router.assign_family_admin |
| DELETE | `/clans/{clan_id}/admins/{user_id}` | yes | require_action(clan.fa.revoke) |  | controllers.auth_access.user_admin_router.revoke_family_admin |
| PUT | `/clans/{clan_id}/admins/{user_id}/permissions` | yes | require_action(clan.fa_permissions.update) |  | controllers.auth_access.user_admin_router.update_fa_permissions |
| GET | `/clans/{clan_id}/users` | yes | require_action(clan.users.list) |  | controllers.auth_access.user_admin_router.list_clan_users |
| GET | `/families` | **NO** | - | public | controllers.family_management.public_router.search_public_families |
| GET | `/families/{family_id}/branches` | yes | family-permission |  | controllers.member_api_router.list_family_branches |
| POST | `/families/{family_id}/branches` | yes | family-permission |  | controllers.member_api_router.create_family_branch |
| DELETE | `/families/{family_id}/branches/{branch_id}` | yes | family-permission |  | controllers.member_api_router.delete_family_branch |
| GET | `/families/{family_id}/persons/export` | yes | family-permission |  | controllers.member_api_router.export_persons |
| GET | `/families/{family_id}/profile` | yes | family-permission |  | controllers.member_api_router.get_clan_profile |
| PUT | `/families/{family_id}/profile` | yes | family-permission |  | controllers.member_api_router.update_clan_profile |
| GET | `/members` | yes | family-permission, system-admin |  | controllers.member_api_router.list_members |
| GET | `/members/{member_id}` | yes | family-permission |  | controllers.member_api_router.get_member_detail |
| GET | `/networks/diagram` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_network_diagram |
| GET | `/networks/families` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_network_families |
| GET | `/networks/families/{target_family_id}/shared-tree` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_shared_tree |
| GET | `/networks/link-requests` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.list_link_requests |
| POST | `/networks/link-requests` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.create_link_request |
| POST | `/networks/link-requests/{request_id}/review` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.review_link_request |
| GET | `/networks/links` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.list_inter_clan_links |
| DELETE | `/networks/links/{link_id}` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.terminate_link |
| GET | `/networks/links/{link_id}/policies` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_sharing_policies |
| PUT | `/networks/links/{link_id}/policies` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.update_sharing_policy |
| POST | `/networks/links/{link_id}/terminate` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.terminate_link |
| GET | `/networks/shared-tree/{target_family_id}` | yes | clan-permission(inter-family (member / family.update)) |  | controllers.inter_family.router.get_shared_tree |
| GET | `/persons/export` | yes | family-permission |  | controllers.member_api_router.export_persons |
| GET | `/public/families` | **NO** | - | public | controllers.family_management.public_router.search_public_families |
| GET | `/service-plans` | **NO** | - | public | controllers.family_management.public_router.list_service_plans |

140 routes, 113 authenticated, 27 without authentication.
