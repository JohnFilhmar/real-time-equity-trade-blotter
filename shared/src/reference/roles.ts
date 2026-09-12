/** Coarse role gates. The actual decision is made on a permission, never on one of these. */
export const role_values = ['VIEWER', 'TRADER', 'ADMIN'] as const;

/** A role a user can hold. */
export type Role = (typeof role_values)[number];

/**
 * Every permission the API checks.
 *
 * Named for the decision rather than the role, so a route says what it needs rather than who is
 * allowed. The `.any` pair is what separates an administrator from a trader in practice: a trader
 * may amend and cancel their own trades, an administrator may act on anyone's.
 */
export const permission_values = [
  'trade.read',
  'trade.create',
  'trade.amend',
  'trade.amend.any',
  'trade.cancel',
  'trade.cancel.any',
] as const;

/** A permission the API checks. */
export type Permission = (typeof permission_values)[number];

/** What each role can do. The only place a role is turned into permissions. */
export const role_permissions: Readonly<Record<Role, readonly Permission[]>> = {
  VIEWER: ['trade.read'],
  TRADER: ['trade.read', 'trade.create', 'trade.amend', 'trade.cancel'],
  ADMIN: [
    'trade.read',
    'trade.create',
    'trade.amend',
    'trade.amend.any',
    'trade.cancel',
    'trade.cancel.any',
  ],
};

/**
 * Lists what a role may do.
 *
 * @param role - The role to expand.
 * @returns Its permissions.
 */
export function permissions_for(role: Role): readonly Permission[] {
  return role_permissions[role];
}

/**
 * Checks one permission against a role.
 *
 * @param role - The role to check.
 * @param permission - The permission required.
 * @returns True when the role carries it.
 */
export function role_has(role: Role, permission: Permission): boolean {
  return role_permissions[role].includes(permission);
}
