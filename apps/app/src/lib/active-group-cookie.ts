export const ACTIVE_GROUP_COOKIE = "padelaso_active_group_id";

export function setActiveGroupCookie(id: string) {
  document.cookie = `${ACTIVE_GROUP_COOKIE}=${encodeURIComponent(id)};path=/;max-age=31536000;samesite=lax`;
}

export function clearActiveGroupCookie() {
  document.cookie = `${ACTIVE_GROUP_COOKIE}=;path=/;max-age=0;samesite=lax`;
}
