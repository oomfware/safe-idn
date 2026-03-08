// character blocklist for IDN safety checks.
// ported from Chromium's idn_spoof_checker.cc blocklist + identifier status checks.

import { Script, getScript } from './scripts.ts';

// #region blocklist ranges

// MUST be sorted by start code point for binary search.
const blockedRanges: [number, number][] = [
	[0x00a3, 0x00a3], // Pound Sign
	[0x00a9, 0x00a9], // Copyright Sign
	[0x00ae, 0x00ae], // Registered Sign
	[0x00b0, 0x00b0], // Degree Sign
	[0x00e6, 0x00e6], // æ (Latin AE ligature)
	[0x0127, 0x0127], // ħ (Latin H with stroke)
	[0x0131, 0x0131], // ı (Latin dotless i)
	[0x0138, 0x0138], // ĸ (Latin Kra)
	[0x0142, 0x0142], // ł (Latin L with stroke)
	[0x014b, 0x014b], // ŋ (Latin Eng)
	[0x0153, 0x0153], // œ (Latin OE ligature)
	[0x0167, 0x0167], // ŧ (Latin T with stroke)
	[0x0185, 0x0185], // ƅ (Latin Tone Six)
	[0x01c3, 0x01c3], // Latin Retroflex Click (looks like !)
	[0x01d4, 0x01d4], // ǔ (Latin U with caron, Pinyin)
	[0x01cd, 0x01dc], // Latin Ext B; Pinyin
	[0x0250, 0x0258], // IPA Extensions (before ə)
	[0x025a, 0x02af], // IPA Extensions (after ə, 0x0259 kept for .az)
	[0x02bb, 0x02bc], // Modifier Turned Comma / Apostrophe
	[0x02d7, 0x02d7], // Modifier Minus Sign
	[0x02ec, 0x02ec], // Modifier Voicing
	[0x0338, 0x0338], // Combining Long Solidus Overlay
	[0x058a, 0x058a], // Armenian Hyphen (NV8)
	[0x05b0, 0x05bd], // Hebrew points
	[0x05bf, 0x05bf],
	[0x05c1, 0x05c2],
	[0x05c4, 0x05c5],
	[0x05c7, 0x05c7],
	[0x0650, 0x0655], // Arabic diacritics
	[0x0670, 0x0670], // Arabic Superscript Alef
	[0x0964, 0x0964], // Danda
	[0x1100, 0x11ff], // Hangul Jamo (includes Hangul fillers 0x115F-0x1160)
	[0x1c80, 0x1c8f], // Cyrillic Extended-C
	[0x1d00, 0x1dbf], // Phonetic Extensions + Supplement
	[0x1e00, 0x1e9b], // Latin Extended Additional
	[0x1f00, 0x1fff], // Greek Extended
	[0x2010, 0x2014], // Hyphen through Em Dash
	[0x2019, 0x2019], // Right Single Quotation Mark (NV8)
	[0x2027, 0x2027], // Hyphenation Point (NV8)
	[0x2039, 0x203a], // Single Angle Quotation Marks
	[0x2043, 0x2043], // Hyphen Bullet
	[0x2212, 0x2212], // Minus Sign
	[0x2600, 0x26ff], // Misc Symbols
	[0x2700, 0x27bf], // Dingbats
	[0x2796, 0x2796], // Heavy Minus Sign
	[0x2c74, 0x2c74], // Latin V with curl
	[0x2cbb, 0x2cbb], // Coptic Dialect-P Ni
	[0x30a0, 0x30a0], // Katakana-Hiragana Double Hyphen (NV8)
	[0x31f0, 0x31ff], // Small Katakana Extension
	[0xa640, 0xa69f], // Cyrillic Extended-B
	[0xa720, 0xa7ff], // Latin Extended-D
	[0xa774, 0xa774], // Latin Small Letter Num
	[0xab3a, 0xab3a], // Latin Small Letter Open O with Stroke
	[0x1f300, 0x1f9ff], // Emoji/Symbols
];

// #endregion

// #region lookup

const isInBlockedRanges = (cp: number): boolean => {
	let lo = 0;
	let hi = blockedRanges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [start, end] = blockedRanges[mid];
		if (cp < start) {
			hi = mid - 1;
		} else if (cp > end) {
			lo = mid + 1;
		} else {
			return true;
		}
	}
	return false;
};

/**
 * checks if a character is blocked by the IDN safety blocklist.
 * @param ch the character to check (single code point as string)
 * @param cp the code point value
 * @returns true if the character is blocked
 */
export const isBlocked = (ch: string, cp: number): boolean => {
	if (cp <= 0x7f) {
		return false;
	}
	if (isInBlockedRanges(cp)) {
		return true;
	}
	// characters whose script is not in the allowed set are blocked
	if (getScript(ch) === Script.Other) {
		return true;
	}
	return false;
};

// #endregion
