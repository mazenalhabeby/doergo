-- Data Migration: Update existing users with appropriate permissions based on role

-- Migrate CLIENT users to ADMIN with full permissions
UPDATE "users" SET
  role = 'ADMIN',
  platform = 'BOTH',
  "canCreateTasks" = true,
  "canViewAllTasks" = true,
  "canAssignTasks" = true,
  "canManageUsers" = true
WHERE role = 'CLIENT';

-- Set DISPATCHER defaults (keep role, set appropriate permissions)
UPDATE "users" SET
  platform = 'WEB',
  "canCreateTasks" = false,
  "canViewAllTasks" = true,
  "canAssignTasks" = true,
  "canManageUsers" = false
WHERE role = 'DISPATCHER';

-- Set TECHNICIAN defaults (keep role, mobile-only platform)
UPDATE "users" SET
  platform = 'MOBILE',
  "canCreateTasks" = false,
  "canViewAllTasks" = false,
  "canAssignTasks" = false,
  "canManageUsers" = false
WHERE role = 'TECHNICIAN';