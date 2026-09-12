import type { Currency } from '@blotter/shared';

/**
 * Formats a share count with thousands separators.
 *
 * @param quantity - Whole shares.
 * @returns For example `5,000`.
 */
export function format_quantity(quantity: number): string {
  return quantity.toLocaleString('en-GB');
}

/**
 * Formats a price in the instrument's own quote currency.
 *
 * GBX prices are pence and print as whole-ish numbers (`2,814.00`), USD prices as dollars
 * (`227.45`). Both carry two decimals so a column of mixed names lines up; the currency code is
 * shown beside the price by the caller, never inferred from the number's shape.
 *
 * @param price - Price in the instrument's own currency.
 * @returns The price with two decimals and thousands separators.
 */
export function format_price(price: number): string {
  return price.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Converts a notional in the instrument's quote currency into its display currency.
 *
 * GBX is pence sterling, so a notional in GBX is divided by 100 to become pounds. This is a unit
 * change within one currency, not an FX conversion, which is why it is done here and an FX rate
 * is not.
 *
 * @param notional - Quantity times price, in the quote currency.
 * @param currency - The quote currency.
 * @returns The amount in the display currency (USD or GBP).
 */
export function to_display_notional(notional: number, currency: Currency): number {
  return currency === 'GBX' ? notional / 100 : notional;
}

/**
 * Formats a money amount compactly, with the currency symbol.
 *
 * Millions abbreviate to two decimals (`$1.28M`), thousands print in full (`£140,700`), and small
 * amounts keep two decimals. Negative amounts carry a leading minus sign, never parentheses.
 *
 * @param amount - Amount already in the display currency.
 * @param currency - The quote currency the amount came from; decides the symbol.
 * @returns The formatted amount.
 */
export function format_money(amount: number, currency: Currency): string {
  const symbol = currency === 'GBX' ? '£' : '$';
  const sign = amount < 0 ? '−' : '';
  const magnitude = Math.abs(amount);

  if (magnitude >= 1_000_000) {
    const millions = (magnitude / 1_000_000).toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}${symbol}${millions}M`;
  }

  if (magnitude >= 1_000) {
    return `${sign}${symbol}${Math.round(magnitude).toLocaleString('en-GB')}`;
  }

  return `${sign}${symbol}${magnitude.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formats a trade's notional for display: quantity times price, in pounds or dollars.
 *
 * @param quantity - Whole shares.
 * @param price - Price in the instrument's own currency.
 * @param currency - The instrument's quote currency.
 * @returns For example `£140,700` for 5,000 shares at 2,814 GBX.
 */
export function format_notional(quantity: number, price: number, currency: Currency): string {
  return format_money(to_display_notional(quantity * price, currency), currency);
}
