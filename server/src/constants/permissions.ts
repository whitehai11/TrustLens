import { Role } from "@prisma/client";

export const Permissions = {
  MODERATE_REPORTS: "MODERATE_REPORTS",
  VIEW_LOGS: "VIEW_LOGS",
  MANAGE_TICKETS: "MANAGE_TICKETS",
  MANAGE_USERS: "MANAGE_USERS",
  MANAGE_KEYS: "MANAGE_KEYS",
  MANAGE_TIERS: "MANAGE_TIERS",
  MANAGE_BLOCKS: "MANAGE_BLOCKS",
  RESOLVE_ABUSE: "RESOLVE_ABUSE",
  MANAGE_ADMINS: "MANAGE_ADMINS",
  SYSTEM_SETTINGS: "SYSTEM_SETTINGS"
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

const moderatorPermissions: Permission[] = [
  Permissions.MODERATE_REPORTS,
  Permissions.VIEW_LOGS,
  Permissions.MANAGE_TICKETS,
  Permissions.RESOLVE_ABUSE
];

const adminPermissions: Permission[] = [
  ...moderatorPermissions,
  Permissions.MANAGE_USERS,
  Permissions.MANAGE_KEYS,
  Permissions.MANAGE_TIERS,
  Permissions.MANAGE_BLOCKS
];

export const rolePermissions: Record<Role, Permission[]> = {
  USER: [],
  MODERATOR: moderatorPermissions,
  ADMIN: adminPermissions,
  SUPERADMIN: [...adminPermissions, Permissions.MANAGE_ADMINS, Permissions.SYSTEM_SETTINGS]
};

