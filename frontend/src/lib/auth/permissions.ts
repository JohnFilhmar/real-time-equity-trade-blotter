import type { AuthUser, Permission, Trade } from '@blotter/shared';

/**
 * Whether the signed-in user holds a permission.
 *
 * This is a UX decision only: it hides or greys a control. The server re-checks every permission on
 * every request, so a client that edits its own permission list gets a 403 rather than an outcome.
 *
 * @param user - The signed-in user, or `null` when nobody is.
 * @param permission - The permission a control needs.
 * @returns True when the user carries it.
 */
export function can(user: AuthUser | null, permission: Permission): boolean {
  return user !== null && user.permissions.includes(permission);
}

/** Why an action on a particular trade is not available, in words the interface can show. */
export type OwnershipBlock = { allowed: true } | { allowed: false; reason: string };

/**
 * Whether the user may amend or cancel this particular trade.
 *
 * A trader may act on their own trades; acting on someone else's needs the `.any` permission that
 * only an administrator holds. Mirrors the server's ownership rule so the interface can grey the
 * control with the reason before the request is sent.
 *
 * @param user - The signed-in user.
 * @param trade - The trade in question.
 * @param action - Which action is being considered.
 * @returns Allowed, or the reason it is not.
 */
export function can_act_on(
  user: AuthUser | null,
  trade: Trade,
  action: 'amend' | 'cancel',
): OwnershipBlock {
  const own_permission: Permission = action === 'amend' ? 'trade.amend' : 'trade.cancel';
  const any_permission: Permission = action === 'amend' ? 'trade.amend.any' : 'trade.cancel.any';

  if (!can(user, own_permission)) {
    return { allowed: false, reason: `Your role cannot ${action} trades` };
  }

  if (trade.status === 'CANCELLED') {
    return { allowed: false, reason: 'This trade is already cancelled' };
  }

  if (user !== null && (trade.trader === user.traderCode || can(user, any_permission))) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Booked by ${trade.trader}, desk head only` };
}
