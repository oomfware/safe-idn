import { Script, getScript } from './scripts.ts';

// #region dangerous patterns

// combining dot above
const COMBINING_DOT_ABOVE = 0x0307;

// dotless i and j
const LATIN_SMALL_DOTLESS_I = 0x0131;
const LATIN_SMALL_DOTLESS_J = 0x0237;

const combiningMarkRe = /\p{M}/u;

const isCombiningMark = (cp: number): boolean => {
	return combiningMarkRe.test(String.fromCodePoint(cp));
};

const isRtlNonspacingMark = (cp: number): boolean => {
	// Arabic diacritics
	if (cp >= 0x0610 && cp <= 0x061a) {
		return true;
	}
	if (cp >= 0x064b && cp <= 0x065f) {
		return true;
	}
	if (cp === 0x0670) {
		return true;
	}
	if (cp >= 0x06d6 && cp <= 0x06ed) {
		return true;
	}
	// Hebrew points
	if (cp >= 0x0591 && cp <= 0x05bd) {
		return true;
	}
	if (cp === 0x05bf) {
		return true;
	}
	if (cp >= 0x05c1 && cp <= 0x05c2) {
		return true;
	}
	if (cp >= 0x05c4 && cp <= 0x05c5) {
		return true;
	}
	if (cp === 0x05c7) {
		return true;
	}
	return false;
};

/**
 * checks if a label contains dangerous character patterns.
 * ported from Chromium's dangerous_pattern checks.
 *
 * @param codePoints the code points of the label
 * @param chars the characters of the label
 * @returns true if a dangerous pattern is detected
 */
export const hasDangerousPattern = (codePoints: number[], chars: string[]): boolean => {
	for (let i = 0; i < codePoints.length; i++) {
		const cp = codePoints[i];

		// combining dot above (U+0307) after i, j, l, or dotless-i/j
		if (cp === COMBINING_DOT_ABOVE && i > 0) {
			const prev = codePoints[i - 1];
			if (
				prev === 0x69 || // i
				prev === 0x6a || // j
				prev === 0x6c || // l
				prev === LATIN_SMALL_DOTLESS_I ||
				prev === LATIN_SMALL_DOTLESS_J
			) {
				return true;
			}
		}

		// any combining mark after dotless-i (U+0131) or dotless-j (U+0237)
		if ((cp === LATIN_SMALL_DOTLESS_I || cp === LATIN_SMALL_DOTLESS_J) && i + 1 < codePoints.length) {
			const nextScript = getScript(chars[i + 1]);
			if (nextScript === Script.Inherited) {
				// Inherited typically means combining marks
				return true;
			}
		}

		// combining diacritics after non-Latin/Greek/Cyrillic characters
		if (i > 0 && isCombiningMark(cp)) {
			const prevScript = getScript(chars[i - 1]);
			if (
				prevScript !== Script.Latin &&
				prevScript !== Script.Greek &&
				prevScript !== Script.Cyrillic &&
				prevScript !== Script.Common &&
				prevScript !== Script.Inherited
			) {
				// check if this is a combining diacritical mark (U+0300-U+0339)
				// Chromium only blocks U+0300-U+0339; other combining diacriticals
				// are not in the allowed character set to begin with
				if (cp >= 0x0300 && cp <= 0x0339) {
					return true;
				}
			}
		}

		// RTL nonspacing marks after non-RTL scripts
		if (i > 0 && isRtlNonspacingMark(cp)) {
			const prevScript = getScript(chars[i - 1]);
			if (
				prevScript !== Script.Arabic &&
				prevScript !== Script.Hebrew &&
				prevScript !== Script.Common &&
				prevScript !== Script.Inherited
			) {
				return true;
			}
		}
	}

	return false;
};

// #endregion
