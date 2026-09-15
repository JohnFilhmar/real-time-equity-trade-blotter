/**
 * Counterparties a broker would actually face.
 *
 * One list, read by the seed, the simulated desk and the trade ticket's suggestions, so every name
 * the seed books is one the ticket offers. It is a suggestion list, not an allowlist: the ticket and
 * the API both accept a counterparty that is not on it, because a desk takes on new names and has to
 * book them the day it does.
 */
export const counterparties: readonly string[] = [
  'Goldman Sachs',
  'JP Morgan',
  'Morgan Stanley',
  'Barclays',
  'Citigroup',
  'UBS',
  'Deutsche Bank',
  'BNP Paribas',
  'Nomura',
  'Jefferies',
];
