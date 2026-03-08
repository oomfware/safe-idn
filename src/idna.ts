// lightweight tr46 replacement — punycode decode + NFKC_CF validation + approximate bidi

import { punycodeDecode } from './punycode-decode.ts';

// #region types

export interface ToUnicodeResult {
	domain: string;
	error: boolean;
}

// #endregion

// #region constants

// deviation characters exempt from NFKC_CF rejection:
// U+00DF (ß), U+03C2 (ς), U+200C (ZWNJ), U+200D (ZWJ)
const DEVIATION_CHARS = new Set([0x00df, 0x03c2, 0x200c, 0x200d]);

// characters that change under NFKC_Casefold — used to reject mapped/disallowed chars
// replaces tr46's 140 kB mapping table
const CHANGES_WHEN_NFKC_CF_RE = /\p{Changes_When_NFKC_Casefolded}/u;

// leading combining mark (UTS#46 validity criterion 6)
const LEADING_COMBINING_MARK_RE = /^\p{M}/u;

// RTL script detection for approximate bidi validation
const RTL_SCRIPT_RE =
	/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Mandaic}\p{Script=Nko}\p{Script=Samaritan}]/u;

// LTR script chars that conflict with RTL labels
const LTR_SCRIPTS_RE = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;

// hoisted regexes for bidi validation
const LETTER_RE = /^\p{L}/u;
const DIGIT_RE = /^\p{N}/u;

// #endregion

// #region bidi validation

// Extended Arabic-Indic digits (U+06F0-U+06F9) have Bidi_Class=EN, not R/AL/AN,
// so they don't make a domain bidi and must be excluded from RTL detection
const isExtendedArabicIndicDigit = (ch: string): boolean => {
	const cp = ch.codePointAt(0)!;
	return cp >= 0x06f0 && cp <= 0x06f9;
};

const hasRtlChar = (label: string): boolean => {
	// fast reject: skip per-character work if no RTL script chars present
	if (!RTL_SCRIPT_RE.test(label)) {
		return false;
	}
	for (const ch of label) {
		if (RTL_SCRIPT_RE.test(ch) && !isExtendedArabicIndicDigit(ch)) {
			return true;
		}
	}
	return false;
};

const validateBidi = (label: string, isRtl: boolean): boolean => {
	const firstCp = label.codePointAt(0);
	if (firstCp === undefined) {
		return true;
	}
	const first = String.fromCodePoint(firstCp);

	if (!isRtl) {
		// LTR label in a bidi domain — rule 1 requires first char to be L or digit
		return LETTER_RE.test(first) || DIGIT_RE.test(first);
	}

	// last code point — handle surrogate pairs
	const lastIdx = label.length - 1;
	const lastUnit = label.charCodeAt(lastIdx);
	const lastCp =
		lastUnit >= 0xdc00 && lastUnit <= 0xdfff && lastIdx > 0 ? label.codePointAt(lastIdx - 1)! : lastUnit;
	const last = String.fromCodePoint(lastCp);

	// rule 1: first character must be R/AL (RTL script letter/punctuation) or L (LTR letter).
	// Arabic-Indic digits (U+0660-U+0669) are Script=Arabic but Bidi_Class=AN, not R/AL,
	// so they cannot satisfy rule 1 — we exclude all RTL script digits
	const isRtlStart = RTL_SCRIPT_RE.test(first) && !isExtendedArabicIndicDigit(first) && !DIGIT_RE.test(first);
	const isLtrLetter = LETTER_RE.test(first) && !isRtlStart;

	if (!isRtlStart && !isLtrLetter) {
		return false;
	}

	if (isRtlStart) {
		// RTL label must not contain LTR script letters
		if (LTR_SCRIPTS_RE.test(label)) {
			return false;
		}
		// last char must be RTL letter/punctuation, or a digit
		return RTL_SCRIPT_RE.test(last) || LETTER_RE.test(last) || DIGIT_RE.test(last);
	}

	return true;
};

// #endregion

// #region label validation

const isAllAscii = (s: string): boolean => {
	for (let i = 0; i < s.length; i++) {
		if (s.charCodeAt(i) >= 0x80) {
			return false;
		}
	}
	return true;
};

// checks for NFKC_CF-unstable characters and U+3002 IDEOGRAPHIC FULL STOP,
// which is a dot separator mapped to '.' in UTS#46 but has CWKCF=false
const hasNfkcCfUnstableOrDotSeparator = (label: string): boolean => {
	for (const ch of label) {
		const cp = ch.codePointAt(0)!;
		if (cp === 0x3002) {
			return true;
		}
		if (DEVIATION_CHARS.has(cp)) {
			continue;
		}
		if (CHANGES_WHEN_NFKC_CF_RE.test(ch)) {
			return true;
		}
	}
	return false;
};

const isPunycodePrefix = (label: string): boolean => {
	return (
		label.length >= 4 &&
		(label.charCodeAt(0) | 0x20) === 0x78 && // x/X
		(label.charCodeAt(1) | 0x20) === 0x6e && // n/N
		label.charCodeAt(2) === 0x2d &&
		label.charCodeAt(3) === 0x2d
	);
};

const processLabel = (label: string): { decoded: string; error: boolean } => {
	let decoded = label;

	if (isPunycodePrefix(label)) {
		try {
			decoded = punycodeDecode(label.substring(4));
		} catch {
			return { decoded: '', error: true };
		}
		if (decoded.length === 0 || isAllAscii(decoded)) {
			return { decoded: '', error: true };
		}
	}

	// skip validation for pure ASCII labels (not decoded from punycode)
	if (label === decoded && isAllAscii(decoded)) {
		return { decoded, error: false };
	}

	// NFC check (UTS#46 rule 1)
	if (decoded !== decoded.normalize('NFC')) {
		return { decoded, error: true };
	}

	// leading combining mark (UTS#46 rule 6)
	if (LEADING_COMBINING_MARK_RE.test(decoded)) {
		return { decoded, error: true };
	}

	// dot in decoded label (UTS#46 rule 5)
	if (decoded.includes('.')) {
		return { decoded, error: true };
	}

	// hyphens at positions 3-4 (UTS#46 validity criterion 4).
	// ICU always enforces this regardless of CheckHyphens — prevents ACE prefix confusion.
	// leading/trailing hyphens are NOT checked (matching Chromium's CheckHyphens=false).
	if (decoded.length >= 4 && decoded[2] === '-' && decoded[3] === '-') {
		return { decoded, error: true };
	}

	// NFKC_CF stability + U+3002 dot separator
	if (hasNfkcCfUnstableOrDotSeparator(decoded)) {
		return { decoded, error: true };
	}

	return { decoded, error: false };
};

// #endregion

// #region public API

/**
 * converts a domain name to Unicode form, validating according to UTS#46 rules.
 * lightweight replacement for tr46's `toUnicode()` using `\p{Changes_When_NFKC_Casefolded}`
 * instead of a full IDNA mapping table, and approximate bidi checks via `\p{Script=...}`.
 *
 * matches Chromium's ICU configuration: bidi checking always on, no STD3 rules,
 * no CheckHyphens (leading/trailing hyphens are not checked). `--` at positions 3-4
 * is always enforced by ICU regardless of CheckHyphens to prevent ACE prefix confusion.
 *
 * @param domainName the domain name to process
 * @returns the decoded domain and whether any errors were found
 */
export const toUnicode = (domainName: string): ToUnicodeResult => {
	if (domainName === '') {
		return { domain: '', error: false };
	}

	const inputLabels = domainName.split('.');
	const outputLabels: string[] = [];
	let hasError = false;

	for (const label of inputLabels) {
		const { decoded, error } = processLabel(label);
		outputLabels.push(decoded);
		if (error) {
			hasError = true;
		}
	}

	// bidi check operates on the whole domain (always on, matching UIDNA_CHECK_BIDI)
	{
		const rtlFlags = outputLabels.map(hasRtlChar);
		if (rtlFlags.some(Boolean)) {
			for (let i = 0; i < outputLabels.length; i++) {
				if (outputLabels[i].length > 0 && !validateBidi(outputLabels[i], rtlFlags[i])) {
					hasError = true;
				}
			}
		}
	}

	return {
		domain: outputLabels.join('.'),
		error: hasError,
	};
};

// #endregion
