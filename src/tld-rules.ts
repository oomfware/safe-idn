// TLD-specific character rules.
// certain characters are only allowed under specific TLDs.

/**
 * checks TLD-specific character restrictions.
 * @param cp the code point
 * @param prevCp the previous code point (for context checks like middle dot)
 * @param nextCp the next code point (for context checks like middle dot)
 * @param tld the top-level domain
 * @returns true if the character is blocked under this TLD
 */
export function isTldRestricted(
	cp: number,
	prevCp: number | undefined,
	nextCp: number | undefined,
	tld: string,
): boolean {
	// U+00FE (þ) and U+00F0 (ð) only allowed under .is, .fo
	if (cp === 0x00fe || cp === 0x00f0) {
		return tld !== 'is' && tld !== 'fo';
	}

	// U+0259 (ə) only allowed under .az
	if (cp === 0x0259) {
		return tld !== 'az';
	}

	// U+00B7 (middle dot) only allowed between two 'l' under .cat
	if (cp === 0x00b7) {
		if (tld !== 'cat') {
			return true;
		}
		// must be between two 'l' (U+006C)
		return prevCp !== 0x6c || nextCp !== 0x6c;
	}

	return false;
}
