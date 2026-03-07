# @oomfware/safe-idn

detect IDN homograph spoofing.

```sh
npm install @oomfware/safe-idn
```

browsers and other user agents must decide whether to display internationalized domain names (IDN)
in their decoded Unicode form or keep them as punycode. showing Unicode unconditionally enables
phishing — for example, `xn--80ak6aa92e.com` decodes to `аррӏе.com`, which uses Cyrillic letters to
impersonate `apple.com`.

this library implements [Chromium's IDN display algorithm][chromium-idn] in TypeScript. it checks
each label of a domain for script mixing, confusable characters, dangerous patterns, and other
spoofing vectors, then returns either the safe Unicode form or the original punycode.

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

the following safety checks are performed, matching Chromium's behavior:

- **script mixing** — blocks unsafe combinations of Unicode scripts (e.g., Latin + Cyrillic)
- **whole-script confusables** — detects labels where every character in a script has a Latin
  lookalike (e.g., Cyrillic "а" for Latin "a")
- **skeleton confusables** — compares [UTS #39][uts39] skeletons against a list of top domains to
  catch near-lookalikes
- **character blocklist** — blocks characters known to cause confusion (symbols, ligatures, IPA
  extensions, etc.)
- **dangerous patterns** — catches combining mark abuse, dot-after-i/j tricks, and RTL mark
  misplacement
- **mixed digit systems** — prevents mixing digits from different scripts
- **digit lookalikes** — detects non-digit characters that resemble ASCII digits
- **kana confusables** — catches Hiragana/Katakana interchange and context violations
- **TLD-specific rules** — restricts characters like þ, ð, ə, and · to their appropriate TLDs
- **deviation characters** — blocks ZWNJ and ZWJ
- **IDN TLD spoofing** — detects punycode TLDs whose skeletons match common ASCII TLDs

[uts39]: https://www.unicode.org/reports/tr39/
