import { resourceName } from '../shared/resource-names.js';

// Saved games and replays contain log text from before the resource was renamed.
export function gameLogText(text) {
  const name = resourceName('wool');
  return text
    .replace(/^The wool supply cannot cover production; nobody receives wool\.$/, `The ${name} supply cannot cover production; nobody receives ${name}.`)
    .replace(/( exchanged \d+ )(\w+)( for \d+ )(\w+)\.$/, (_, givePrefix, give, receivePrefix, receive) =>
      `${givePrefix}${resourceName(give)}${receivePrefix}${resourceName(receive)}.`)
    .replace(/( collected \d+ )wool(?= with Monopoly\.$)/, `$1${name}`);
}
