# @oomfware/safe-idn

detect IDN homograph spoofing.

```sh
npm install @oomfware/safe-idn
```

browsers and other user agents must decide whether to display internationalized domain names (IDN)
in their decoded Unicode form or keep them as punycode. showing Unicode unconditionally enables
phishing — for example, `xn--80ak6aa92e.com` decodes to `аррӏе.com`, which uses Cyrillic letters to
impersonate `apple.com`.

this library implements the per-label checks from [Chromium's IDN display algorithm][chromium-idn]
in TypeScript. it checks each label of a domain for script mixing, confusable characters, dangerous
patterns, and other spoofing vectors, then returns either the safe Unicode form or the original
punycode.

it deliberately omits Chromium's skeleton matching against a list of popular domains. that approach
requires bundling and maintaining an inherently incomplete brand list, so — like Firefox — this
library relies on structural rules that protect every domain uniformly rather than a curated set.
the whole-script confusable check still catches the dangerous invisible cases (e.g. all-Cyrillic
`аррӏе`), so this remains stricter than Firefox on those. the trade-off is that same-script
lookalikes of a specific brand (e.g. `googlé.com`) are treated as valid Unicode.

[chromium-idn]: https://chromium.googlesource.com/chromium/src/+/main/docs/idn.md

## usage

### quick check

use `safeDisplay()` to get the safe display form of a domain:

```ts
import { safeDisplay } from '@oomfware/safe-idn';

// safe domains decode to Unicode
safeDisplay('xn--nxasmq6b.com');
// -> "βόλος.com"

// spoofed domains stay as punycode
safeDisplay('xn--80ak6aa92e.com');
// -> "xn--80ak6aa92e.com" (Cyrillic "аррӏе" impersonating "apple")
```

### detailed results

use `checkDomain()` for per-label verdicts:

```ts
import { checkDomain } from '@oomfware/safe-idn';

const result = checkDomain('xn--80ak6aa92e.com');

console.log(result.display);
// -> "xn--80ak6aa92e.com"

console.log(result.labels[0]);
// -> { input: 'xn--80ak6aa92e', unicode: 'аррӏе', result: 'unsafe' }
```

each label result contains:

- `input` — the original label as it appeared in the domain
- `unicode` — the decoded Unicode form (even if unsafe)
- `result` — `'safe'`, `'unsafe'`, or `'invalid'`

## what it checks

the following per-label safety checks are performed, matching Chromium's behavior:

- **script mixing** — blocks unsafe combinations of Unicode scripts (e.g., Latin + Cyrillic)
- **whole-script confusables** — detects labels where every character in a script has a Latin
  lookalike (e.g., Cyrillic "а" for Latin "a")
- **character blocklist** — blocks characters known to cause confusion (symbols, ligatures, IPA
  extensions, etc.)
- **dangerous patterns** — catches combining mark abuse, dot-after-i/j tricks, and RTL mark
  misplacement
- **mixed digit systems** — prevents mixing digits from different scripts
- **digit lookalikes** — detects non-digit characters that resemble ASCII digits
- **kana confusables** — catches Hiragana/Katakana interchange and context violations
- **TLD-specific rules** — restricts characters like þ, ð, ə, and · to their appropriate TLDs
- **deviation characters** — blocks ZWNJ and ZWJ
