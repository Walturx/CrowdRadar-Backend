/** `ana.ruiz@crowdradar.pe` -> `a*******@crowdradar.pe`: enough to correlate an audit line, not to recover the address. */
export function enmascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  if (arroba < 1) return '***';
  return `${email[0]}${'*'.repeat(Math.min(arroba - 1, 7))}${email.slice(arroba)}`;
}

/** Query parameters that carry a secret (the recovery token travels in the emailed link). */
const PARAMETRO_SECRETO = /([?&]token=)[^&#]*/gi;

/** A request URL safe to log: the value of a secret query parameter is replaced. */
export const redactarUrl = (url: string | undefined): string | undefined => url?.replace(PARAMETRO_SECRETO, '$1[REDACTADO]');

/** Secret query parameter inside free text (stops at `&`, `#`, whitespace, quotes and angle brackets). */
const TOKEN_EN_TEXTO = /([?&]token=)([^&#\s"'<>]*)/gi;

/** `?token=abcdef123456` -> `?token=••••3456`: only the last 4 characters survive, and never a token of 8 or fewer. */
export const enmascararEnlace = (texto: string): string =>
  texto.replace(TOKEN_EN_TEXTO, (_todo, prefijo: string, token: string) => `${prefijo}••••${token.length > 8 ? token.slice(-4) : ''}`);
