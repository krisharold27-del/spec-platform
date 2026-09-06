/** Who's allowed on /admin — a fixed allowlist from ADMIN_EMAILS (comma-separated), not a role in the app's own data. */
export function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase().trim());
}
