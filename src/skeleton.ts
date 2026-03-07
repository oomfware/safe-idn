import { confusableMap } from './data/confusables.ts';

// #region skeleton algorithm

/**
 * computes the UTS #39 skeleton of a string.
 * the skeleton is used to detect confusable strings:
 * two strings are confusable iff skeleton(a) === skeleton(b).
 *
 * algorithm:
 * 1. NFD normalize
 * 2. replace each code point with its prototype from confusables map
 * 3. NFD normalize again
 *
 * the confusables map is pre-resolved to a fixed point at generation time,
 * so a single pass suffices (no intermediate forms remain).
 *
 * @param input the string to compute the skeleton for
 * @returns the skeleton string
 */
export function skeleton(input: string): string {
	const nfd = input.normalize('NFD');
	let out = '';
	for (const ch of nfd) {
		out += confusableMap.get(ch.codePointAt(0)!) ?? ch;
	}
	return out.normalize('NFD');
}

/**
 * computes the skeleton of a string with diacritics stripped.
 * used for top-domain matching where accented variants should match
 * the base domain (e.g., googlé.com → google.com).
 *
 * @param input the string to process
 * @returns the skeleton with diacritics removed
 */
export function skeletonStripDiacritics(input: string): string {
	// strip combining marks after computing skeleton
	const skel = skeleton(input);
	return skel.replace(/\p{M}/gu, '');
}

// #endregion
