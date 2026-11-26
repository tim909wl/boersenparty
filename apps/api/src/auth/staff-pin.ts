import type { Role } from '@boersenparty/contracts';
// Shared credentials must never authorize administrative or approval capabilities.
export function pinEligible(roles: Role[]): boolean { return roles.length > 0 && roles.every(role => role === 'BAR' || role === 'TOPUP'); }

// Optional individual PINs; if the map exists, no shared-PIN fallback for unlisted users.
export function staffPinFor(username:string):string|undefined {
  const configured=process.env.STAFF_USER_PINS;
  if(!configured)return process.env.STAFF_LOGIN_PIN;
  try{const pins=JSON.parse(configured);return pins&&typeof pins==='object'&&Object.hasOwn(pins,username)&&typeof pins[username]==='string'?pins[username]:undefined}catch{return undefined}
}
export function terminalAllowed(username:string,terminalId:string):boolean {
  const configured=process.env.STAFF_TERMINAL_ASSIGNMENTS;if(!configured)return true;
  try{const assignments=JSON.parse(configured);return !!assignments&&typeof assignments==='object'&&Object.hasOwn(assignments,username)&&Array.isArray(assignments[username])&&assignments[username].includes(terminalId)}catch{return false}
}
