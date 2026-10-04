/** `ana.ruiz@crowdradar.pe` -> `a*******@crowdradar.pe`: enough to correlate an audit line, not to recover the address. */
export function enmascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  if (arroba < 1) return '***';
  return `${email[0]}${'*'.repeat(Math.min(arroba - 1, 7))}${email.slice(arroba)}`;
}
