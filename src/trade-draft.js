export function bankTradeDraft(give, want, stock, rateFor, nameOf) {
  const offered = Object.entries(give).filter(([, quantity]) => quantity > 0);
  const requested = Object.entries(want).filter(([, quantity]) => quantity > 0);
  const [resource, count] = offered[0] ?? [];
  const rate = offered.length === 1 ? rateFor(resource) : null;
  if (!offered.length || !requested.length) return { rate };

  const [receive, amount] = requested[0];
  if (offered.length !== 1 || requested.length !== 1 || resource === receive) {
    return { rate, hint: "The bank trades one resource type for a different type." };
  }
  const available = stock[receive] ?? 0;
  if (amount > available) {
    return { rate, hint: `The bank has ${available} ${nameOf(receive)} left.` };
  }
  if (amount > 24) return { rate, hint: "The bank can trade up to 24 cards at a time." };
  if (count !== rate * amount) {
    return { rate, hint: `Bank: ${amount} ${nameOf(receive)} for ${rate * amount} ${nameOf(resource)}.` };
  }
  return { rate, payload: { give: resource, receive, amount } };
}
