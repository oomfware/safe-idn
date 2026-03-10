import { isBlocked } from './blocklist.ts';
import { hasDangerousPattern } from './dangerous-patterns.ts';
import { toUnicode } from './idna.ts';
import { Script, getScript, getScriptByCodePoint, isScriptComboAllowed } from './scripts.ts';
import { isTldRestricted } from './tld-rules.ts';
import { isWholeScriptConfusable } from './whole-script.ts';

// #region types

export interface LabelResult {
	/** original input label */
	input: string;
	/** decoded unicode form (even if unsafe) */
	unicode: string;
	/** safety verdict */
	result: 'safe' | 'unsafe' | 'invalid';
}

// #endregion

// #region ASCII validity

// LDH (letter-digit-hyphen) ASCII: a-z, 0-9, hyphen
const isLdhAscii = (cp: number): boolean => {
	if (cp >= 0x61 && cp <= 0x7a) {
		return true;
	}
	if (cp >= 0x30 && cp <= 0x39) {
		return true;
	}
	return cp === 0x2d;
};

// #endregion

// #region digit confusables

// digit lookalike characters — non-digit characters that look like digits.
// matches Chromium's digit_lookalikes_ set.
// does NOT include actual script digits (handled by mixedDigits + whole-script confusable).
const digitLookalikes = new Set<number>([
	0x03b8, // θ
	0x0968, // २ (Devanagari 2)
	0x09e8, // ২ (Bengali 2)
	0x0a68, // ੨ (Gurmukhi 2)
	0x0ae8, // ૨ (Gujarati 2)
	0x0ce9, // ೩ (Kannada 3)
	0x0ced, // ೭ (Kannada 7)
	0x0577, // շ (Armenian)
	0x0437, // з (Cyrillic)
	0x0499, // ҙ (Cyrillic)
	0x04e1, // ӡ (Cyrillic)
	0x0909, // उ (Devanagari)
	0x0993, // ও (Bengali)
	0x0a24, // ਤ (Gurmukhi)
	0x0a69, // ੩ (Gurmukhi 3)
	0x0ae9, // ૩ (Gujarati 3)
	0x0c69, // ౩ (Telugu 3)
	0x1012, // ဒ (Myanmar letter Da)
	0x10d5, // ვ (Georgian)
	0x10de, // პ (Georgian)
	0x0a5c, // ੜ (Gurmukhi)
	0x10d9, // კ (Georgian)
	0x0a6b, // ੫ (Gurmukhi 5)
	0x4e29, // 丩 (CJK)
	0x3110, // ㄐ (Bopomofo)
	0x0573, // ճ (Armenian)
	0x09ea, // ৪ (Bengali 4)
	0x0a6a, // ੪ (Gurmukhi 4)
	0x0b6b, // ୫ (Oriya 5)
	0x0aed, // ૭ (Gujarati 7)
	0x0b68, // ୨ (Oriya 2)
	0x0c68, // ౨ (Telugu 2)
]);

// #endregion

// #region context-sensitive character rules

// CJK/Katakana chars that look like slashes or simple strokes — blocked when non-CJK
// on BOTH sides (Chromium's dangerous_pattern: surrounded by non-Kana/Hira/Han)
const cjkSlashLike = new Set([
	0x30ce, // ノ (Katakana No)
	0x30bd, // ソ (Katakana So)
	0x30be, // ゾ (Katakana Zo)
	0x30f3, // ン (Katakana N)
	0x4e40, // 乀
	0x4e41, // 乁
	0x4e3f, // 丿
]);

// CJK ideographs/Bopomofo that look like letters/numbers — blocked when non-CJK
// on EITHER side (Chromium's dangerous_pattern: two separate alternatives)
const cjkLetterLike = new Set([
	0x4e00,
	0x3127,
	0x4e28,
	0x4e5b,
	0x4e03,
	0x4e05,
	0x4e06,
	0x4e01,
	0x4e29,
	0x4e2b,
	0x4e42,
	0x5341,
	0x3007,
	0x3112,
	0x311a,
	0x311f,
	0x3128,
	0x3129,
	0x3108,
	0x31ba,
	0x31b3,
	0x5de5,
	0x8ba0,
	0x4e85,
	0x4e8c,
	0x4ea0,
	0x5196,
	0x5b80,
	0x5ddb,
	0x4e36, // 丶 (also in Chromium's slash-like set, but either-side check dominates)
]);

const isExtendedCjk = (cp: number): boolean => {
	if (cp >= 0x4e00 && cp <= 0x9fff) {
		return true;
	}
	if (cp >= 0x3400 && cp <= 0x4dbf) {
		return true;
	}
	if (cp >= 0x20000 && cp <= 0x2fa1f) {
		return true;
	}
	if (cp >= 0x3040 && cp <= 0x309f) {
		return true;
	} // Hiragana
	if (cp >= 0x30a0 && cp <= 0x30ff) {
		return true;
	} // Katakana
	if (cp >= 0x3100 && cp <= 0x312f) {
		return true;
	} // Bopomofo
	if (cp >= 0x31a0 && cp <= 0x31bf) {
		return true;
	} // Bopomofo Extended
	if (cp >= 0xac00 && cp <= 0xd7af) {
		return true;
	} // Hangul Syllables
	if (cp >= 0x2f00 && cp <= 0x2fdf) {
		return true;
	} // Kangxi Radicals
	return false;
};

// non-CJK neighbor means a letter character (not digit, not hyphen, not combining mark)
const isNonCjkLetter = (cp: number): boolean => {
	if (cp >= 0x0041 && cp <= 0x005a) {
		return true;
	} // A-Z
	if (cp >= 0x0061 && cp <= 0x007a) {
		return true;
	} // a-z
	if (cp >= 0x00c0 && cp <= 0x024f) {
		return true;
	} // Latin Extended
	const s = getScriptByCodePoint(cp);
	return s === Script.Latin || s === Script.Cyrillic || s === Script.Greek;
};

const isCjkCharNextToNonCjk = (
	cp: number,
	idx: number,
	codePoints: number[],
	labelHasNonCjkLetter: boolean,
): boolean => {
	const isSlash = cjkSlashLike.has(cp);
	const isLetter = cjkLetterLike.has(cp);
	if (!isSlash && !isLetter) {
		return false;
	}

	const prev = idx > 0 ? codePoints[idx - 1] : undefined;
	const next = idx + 1 < codePoints.length ? codePoints[idx + 1] : undefined;

	if (isSlash) {
		// slash-like: only blocked when non-CJK on BOTH sides
		// (matches Chromium: [non-CJK][slash][non-CJK])
		const prevNonCjk = prev !== undefined && !isExtendedCjk(prev);
		const nextNonCjk = next !== undefined && !isExtendedCjk(next);
		return prevNonCjk && nextNonCjk;
	}

	// letter-like: blocked when non-CJK on EITHER side
	if (labelHasNonCjkLetter) {
		if (prev !== undefined && !isExtendedCjk(prev)) {
			return true;
		}
		if (next !== undefined && !isExtendedCjk(next)) {
			return true;
		}
	} else {
		if (prev !== undefined && !isExtendedCjk(prev) && isNonCjkLetter(prev)) {
			return true;
		}
		if (next !== undefined && !isExtendedCjk(next) && isNonCjkLetter(next)) {
			return true;
		}
	}

	return false;
};

// #endregion

// #region Katakana context rules

const isInvalidProlongedSoundMark = (idx: number, codePoints: number[]): boolean => {
	if (idx === 0) {
		return true;
	}
	const prev = codePoints[idx - 1];
	const prevScript = getScriptByCodePoint(prev);
	return prevScript !== Script.Hiragana && prevScript !== Script.Katakana;
};

const isInvalidMiddleDot30fb = (codePoints: number[], chars: string[]): boolean => {
	for (let i = 0; i < chars.length; i++) {
		if (codePoints[i] === 0x30fb) {
			continue;
		}
		const s = getScript(chars[i]);
		if (s === Script.Latin) {
			return true;
		}
	}
	return false;
};

const isInvalidKatakanaIteration = (idx: number, codePoints: number[]): boolean => {
	if (idx === 0) {
		return true;
	}
	const prevScript = getScriptByCodePoint(codePoints[idx - 1]);
	return prevScript !== Script.Katakana;
};

// #endregion

// #region mixed digit detection

const getDigitScript = (cp: number): Script | null => {
	if (cp >= 0x0030 && cp <= 0x0039) {
		return Script.Common;
	}
	if (cp >= 0x0660 && cp <= 0x0669) {
		return Script.Arabic;
	}
	if (cp >= 0x06f0 && cp <= 0x06f9) {
		return Script.Arabic;
	}
	if (cp >= 0x0966 && cp <= 0x096f) {
		return Script.Devanagari;
	}
	if (cp >= 0x09e6 && cp <= 0x09ef) {
		return Script.Bengali;
	}
	if (cp >= 0x0a66 && cp <= 0x0a6f) {
		return Script.Gurmukhi;
	}
	if (cp >= 0x0ae6 && cp <= 0x0aef) {
		return Script.Gujarati;
	}
	if (cp >= 0x0b66 && cp <= 0x0b6f) {
		return Script.Oriya;
	}
	if (cp >= 0x0be6 && cp <= 0x0bef) {
		return Script.Tamil;
	}
	if (cp >= 0x0c66 && cp <= 0x0c6f) {
		return Script.Telugu;
	}
	if (cp >= 0x0ce6 && cp <= 0x0cef) {
		return Script.Kannada;
	}
	if (cp >= 0x0d66 && cp <= 0x0d6f) {
		return Script.Malayalam;
	}
	if (cp >= 0x0e50 && cp <= 0x0e59) {
		return Script.Thai;
	}
	if (cp >= 0x0ed0 && cp <= 0x0ed9) {
		return Script.Lao;
	}
	if (cp >= 0x1040 && cp <= 0x1049) {
		return Script.Myanmar;
	}
	if (cp >= 0x1090 && cp <= 0x1099) {
		return Script.Myanmar;
	}
	return null;
};

const hasMixedDigits = (codePoints: number[]): boolean => {
	let digitScript: Script | null = null;
	for (const cp of codePoints) {
		const ds = getDigitScript(cp);
		if (ds === null || ds === Script.Common) {
			continue;
		}
		if (digitScript === null) {
			digitScript = ds;
		} else if (digitScript !== ds) {
			return true;
		}
	}
	return false;
};

const hasMixedDigitAndLookalike = (codePoints: number[]): boolean => {
	let hasAsciiDigit = false;
	let hasDigitLookalike = false;
	for (const cp of codePoints) {
		if (cp >= 0x30 && cp <= 0x39) {
			hasAsciiDigit = true;
		} else if (digitLookalikes.has(cp)) {
			hasDigitLookalike = true;
		}
	}
	return hasAsciiDigit && hasDigitLookalike;
};

// #endregion

// #region digit-only spoof

const isDigitOnlySpoof = (codePoints: number[]): boolean => {
	if (codePoints.length === 0) {
		return false;
	}
	let hasNonAsciiDigit = false;
	for (const cp of codePoints) {
		if (cp >= 0x30 && cp <= 0x39) {
			continue;
		}
		if (cp === 0x2d) {
			continue;
		}
		if (digitLookalikes.has(cp)) {
			hasNonAsciiDigit = true;
			continue;
		}
		return false;
	}
	return hasNonAsciiDigit;
};

// #endregion

// #region repeated combining marks detection

const combiningMarkRe = /\p{M}/u;

const hasRepeatedCombiningMarks = (labelText: string): boolean => {
	// decompose to NFD to detect composed char + same combining mark
	const nfd = labelText.normalize('NFD');
	const chars = [...nfd];
	for (let i = 1; i < chars.length; i++) {
		if (combiningMarkRe.test(chars[i]) && combiningMarkRe.test(chars[i - 1])) {
			if (chars[i] === chars[i - 1]) {
				return true;
			}
		}
	}
	return false;
};

// #endregion

// #region Gershayim (U+05F4) context

const isGershayimSafe = (codePoints: number[], chars: string[]): boolean => {
	for (let i = 0; i < codePoints.length; i++) {
		if (codePoints[i] === 0x05f4) {
			continue;
		}
		const s = getScript(chars[i]);
		if (s !== Script.Hebrew && s !== Script.Common && s !== Script.Inherited) {
			return false;
		}
	}
	return true;
};

// #endregion

// #region non-ASCII Latin + CJK mixing check

// Chromium: non-ASCII Latin (accented characters) must not mix with CJK scripts.
// only basic ASCII Latin can mix with Han/Kana/Hangul/Bopomofo.
const hasNonAsciiLatinWithCjk = (codePoints: number[], chars: string[]): boolean => {
	let hasNonAsciiLatin = false;
	let hasCjkScript = false;
	for (let i = 0; i < codePoints.length; i++) {
		const cp = codePoints[i];
		const s = getScript(chars[i]);
		// non-ASCII Latin letter
		if (s === Script.Latin && cp > 0x7f) {
			hasNonAsciiLatin = true;
		}
		if (
			s === Script.Han ||
			s === Script.Hiragana ||
			s === Script.Katakana ||
			s === Script.Hangul ||
			s === Script.Bopomofo
		) {
			hasCjkScript = true;
		}
	}
	return hasNonAsciiLatin && hasCjkScript;
};

// #endregion

// #region Kana confusable letters

// Hiragana letters that look exactly like their Katakana equivalents
const hiraganaConfusables = new Set([0x3078, 0x3079, 0x307a]); // へ べ ぺ
const katakanaConfusables = new Set([0x30d8, 0x30d9, 0x30da]); // ヘ ベ ペ

// detects Hiragana confusable letters in an otherwise-Katakana label or vice versa.
// Chromium: ^[\p{scx=kana}]+[\u3078-\u307a][\p{scx=kana}]+$
const hasKanaConfusableMix = (codePoints: number[]): boolean => {
	let hasHiraganaConfusable = false;
	let hasKatakanaConfusable = false;
	let allOthersKatakanaLike = true;
	let allOthersHiraganaLike = true;
	let otherCount = 0;

	for (const cp of codePoints) {
		if (hiraganaConfusables.has(cp)) {
			hasHiraganaConfusable = true;
		} else if (katakanaConfusables.has(cp)) {
			hasKatakanaConfusable = true;
		} else {
			otherCount++;
			const s = getScriptByCodePoint(cp);
			if (s !== Script.Katakana && s !== Script.Common) {
				allOthersKatakanaLike = false;
			}
			if (s !== Script.Hiragana && s !== Script.Common) {
				allOthersHiraganaLike = false;
			}
		}
	}

	if (otherCount === 0) {
		return false;
	}

	// Hiragana confusable letter in an otherwise-Katakana label
	if (hasHiraganaConfusable && allOthersKatakanaLike) {
		return true;
	}
	// Katakana confusable letter in an otherwise-Hiragana label
	if (hasKatakanaConfusable && allOthersHiraganaLike) {
		return true;
	}

	return false;
};

// #endregion

// #region deviation characters

// U+200C (ZWNJ) and U+200D (ZWJ) are deviation characters — always unsafe
// U+00DF (ß) in combination with Latin-lookalike domains → skeleton check handles it
const isUnsafeDeviationChar = (cp: number): boolean => {
	return cp === 0x200c || cp === 0x200d;
};

// #endregion

// #region main label check

const getSingleScript = (scripts: Set<Script>): Script | null => {
	if (scripts.size === 1) {
		return scripts.values().next().value!;
	}
	return null;
};

const runSafetyChecks = (input: string, unicode: string, tld: string): LabelResult => {
	const chars = [...unicode];
	const codePoints = chars.map((ch) => ch.codePointAt(0)!);

	// non-LDH ASCII check — characters outside [a-z0-9-] in a label with non-ASCII content.
	// Chromium's uspoof_setAllowedUnicodeSet blocks these; we don't use STD3 rules in toUnicode,
	// so catch them here instead.
	for (const cp of codePoints) {
		if (cp <= 0x7f && !isLdhAscii(cp)) {
			return { input, unicode, result: 'unsafe' };
		}
	}

	// deviation characters — ZWNJ/ZWJ always unsafe
	for (const cp of codePoints) {
		if (isUnsafeDeviationChar(cp)) {
			return { input, unicode, result: 'unsafe' };
		}
	}

	// blocklist + identifier status
	for (let i = 0; i < codePoints.length; i++) {
		if (isBlocked(chars[i], codePoints[i])) {
			return { input, unicode, result: 'unsafe' };
		}
	}

	// script detection
	const scripts = new Set<Script>();
	const actualScripts = new Set<Script>(); // non-Common/Inherited scripts
	for (const ch of chars) {
		const s = getScript(ch);
		scripts.add(s);
		if (s !== Script.Common && s !== Script.Inherited) {
			actualScripts.add(s);
		}
	}

	// script mixing — check combo table
	if (!isScriptComboAllowed(scripts)) {
		return { input, unicode, result: 'unsafe' };
	}

	// "Other" scripts: two different "Other" scripts must not mix
	{
		const otherScripts = [...actualScripts].filter(
			(s) =>
				s !== Script.Latin &&
				s !== Script.Cyrillic &&
				s !== Script.Greek &&
				s !== Script.Han &&
				s !== Script.Hiragana &&
				s !== Script.Katakana &&
				s !== Script.Hangul &&
				s !== Script.Bopomofo,
		);
		if (otherScripts.length > 1) {
			return { input, unicode, result: 'unsafe' };
		}
	}

	// non-ASCII Latin + CJK mixing
	if (hasNonAsciiLatinWithCjk(codePoints, chars)) {
		return { input, unicode, result: 'unsafe' };
	}

	// mixed numbering systems
	if (hasMixedDigits(codePoints)) {
		return { input, unicode, result: 'unsafe' };
	}
	if (hasMixedDigitAndLookalike(codePoints)) {
		return { input, unicode, result: 'unsafe' };
	}

	// Kana confusable letters (Hiragana へ/べ/ぺ in Katakana, or vice versa)
	if (hasKanaConfusableMix(codePoints)) {
		return { input, unicode, result: 'unsafe' };
	}

	// Kana combining marks (U+3099, U+309A) — blocked in multi-script labels.
	// in Chromium, single-script labels return early before dangerous_pattern runs,
	// so \u3099|\u309A only triggers for multi-script labels.
	{
		const isSingleKana =
			actualScripts.size <= 1 &&
			(actualScripts.size === 0 || actualScripts.has(Script.Katakana) || actualScripts.has(Script.Hiragana));
		if (!isSingleKana) {
			for (const cp of codePoints) {
				if (cp === 0x3099 || cp === 0x309a) {
					return { input, unicode, result: 'unsafe' };
				}
			}
		}
	}

	// repeated combining marks (using NFD to catch composed+combining)
	if (hasRepeatedCombiningMarks(unicode)) {
		return { input, unicode, result: 'unsafe' };
	}

	// precompute whether the label has non-CJK letters (for CJK adjacency check)
	const labelHasNonCjkLetter = codePoints.some((cp) => isNonCjkLetter(cp));

	// context-sensitive character checks
	for (let i = 0; i < codePoints.length; i++) {
		const cp = codePoints[i];

		// TLD restrictions (þ, ð → .is/.fo; ə → .az; · → .cat between l's)
		if (
			isTldRestricted(
				cp,
				i > 0 ? codePoints[i - 1] : undefined,
				i + 1 < codePoints.length ? codePoints[i + 1] : undefined,
				tld,
			)
		) {
			return { input, unicode, result: 'unsafe' };
		}

		// U+30FC (Prolonged Sound Mark)
		if (cp === 0x30fc && isInvalidProlongedSoundMark(i, codePoints)) {
			return { input, unicode, result: 'unsafe' };
		}

		// U+30FB (Katakana Middle Dot)
		if (cp === 0x30fb && isInvalidMiddleDot30fb(codePoints, chars)) {
			return { input, unicode, result: 'unsafe' };
		}

		// U+30FD, U+30FE (Katakana iteration marks)
		if ((cp === 0x30fd || cp === 0x30fe) && isInvalidKatakanaIteration(i, codePoints)) {
			return { input, unicode, result: 'unsafe' };
		}

		// CJK characters next to non-CJK
		if (isCjkCharNextToNonCjk(cp, i, codePoints, labelHasNonCjkLetter)) {
			return { input, unicode, result: 'unsafe' };
		}

		// Gershayim (U+05F4)
		if (cp === 0x05f4 && !isGershayimSafe(codePoints, chars)) {
			return { input, unicode, result: scripts.has(Script.Latin) ? 'invalid' : 'unsafe' };
		}
	}

	// whole-script confusable check (character-set based)
	{
		const labelScript = getSingleScript(actualScripts);
		if (isWholeScriptConfusable(codePoints, labelScript, tld, unicode)) {
			return { input, unicode, result: 'unsafe' };
		}
	}

	// digit-only spoofs
	if (isDigitOnlySpoof(codePoints)) {
		return { input, unicode, result: 'unsafe' };
	}

	// dangerous patterns
	if (hasDangerousPattern(codePoints, chars)) {
		return { input, unicode, result: 'unsafe' };
	}

	return { input, unicode, result: 'safe' };
};

const checkPunycodeLabel = (label: string, tld: string): LabelResult => {
	const result = toUnicode(label);

	if (result.error) {
		return { input: label, unicode: '', result: 'invalid' };
	}

	const unicode = result.domain;

	if (!/[^\x00-\x7f]/.test(unicode)) {
		return { input: label, unicode, result: 'safe' };
	}

	return runSafetyChecks(label, unicode, tld);
};

/**
 * checks a single label for IDN safety.
 *
 * @param label the raw label (may be punycode like "xn--...")
 * @param tld the top-level domain (ASCII form)
 * @returns the label check result
 */
export const checkLabel = (label: string, tld: string): LabelResult => {
	if (label === '' || !/[^\x00-\x7f]/.test(label)) {
		if (label.startsWith('xn--')) {
			return checkPunycodeLabel(label, tld);
		}
		return { input: label, unicode: label, result: 'safe' };
	}
	return runSafetyChecks(label, label, tld);
};

// #endregion
