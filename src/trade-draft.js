import { MAX_BANK_TRADE_CARDS, resourceStock } from "../shared/trades.js";

export function bankTradeDraft(give, want, stock, rateFor, nameOf) {
  const offered = Object.entries(give).filter(([, quantity]) => quantity > 0);
  const requested = Object.entries(want).filter(([, quantity]) => quantity > 0);
  const [resource, count] = offered[0] ?? [];
  const rate = offered.length === 1 ? rateFor(resource) : null;
  if (!offered.length || !requested.length) return { rate };

  if (offered.length !== 1) {
    return { rate, hint: "Give one resource type at a time to the bank." };
  }
  if (requested.some(([type]) => type === resource)) {
    return { rate, hint: "Choose different resources to give and receive." };
  }
  for (const [type, quantity] of requested) {
    const available = resourceStock(stock, type);
    if (quantity > available) return { rate, hint: `The bank has ${available} ${nameOf(type)} left.` };
  }
  const amount = requested.reduce((total, [, quantity]) => total + quantity, 0);
  if (amount > MAX_BANK_TRADE_CARDS) return { rate, hint: `The bank can trade up to ${MAX_BANK_TRADE_CARDS} cards at a time.` };
  const cost = rate * amount;
  if (count !== cost) {
    return { rate, hint: `Give ${cost} ${nameOf(resource)} for ${amount} ${amount === 1 ? "card" : "cards"} from the bank.` };
  }
  const payload = requested.length === 1
    ? { give: resource, receive: requested[0][0], amount }
    : { give: resource, receive: Object.fromEntries(requested) };
  return { rate, payload };
}
