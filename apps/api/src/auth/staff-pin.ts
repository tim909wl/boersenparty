import type { Role } from '@boersenparty/contracts';
// Shared credentials must never authorize administrative or approval capabilities.
export function pinEligible(roles: Role[]): boolean { return roles.length > 0 && roles.every(role => role === 'BAR' || role === 'TOPUP'); }
