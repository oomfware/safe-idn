// #region script type

/** Unicode script identifiers relevant to IDN safety checks. */
export type Script = (typeof Script)[keyof typeof Script];
export const Script = {
	Common: 0,
	Inherited: 1,
	Latin: 2,
	Cyrillic: 3,
	Greek: 4,
	Han: 5,
	Hiragana: 6,
	Katakana: 7,
	Hangul: 8,
	Bopomofo: 9,
	Arabic: 10,
	Armenian: 11,
	Bengali: 12,
	Devanagari: 13,
	Ethiopic: 14,
	Georgian: 15,
	Gujarati: 16,
	Gurmukhi: 17,
	Hebrew: 18,
	Kannada: 19,
	Lao: 20,
	Malayalam: 21,
	Myanmar: 22,
	Oriya: 23,
	Tamil: 24,
	Telugu: 25,
	Thai: 26,
	Tibetan: 27,
	Other: 28,
} as const;

// #endregion

// #region script detection

// code-point range table for script detection.
// covers the Unicode blocks relevant to IDN safety checks.
// characters not covered by any range fall through to Script.Other,
// which causes them to be blocked by the identifier status check.
//
// within a block, a handful of code points have a different Script value
// (e.g. U+30FB Katakana Middle Dot is Common). these are handled by
// dedicated checks in label-checker.ts before script detection matters,
// so block-level classification is safe here.

const getScriptFromCp = (cp: number): Script => {
	// ASCII — most common in domain names
	if (cp < 0x80) {
		if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
			return Script.Latin;
		}
		return Script.Common;
	}

	// Latin-1 Supplement (U+0080–00FF)
	if (cp <= 0xff) {
		if (cp < 0xc0 || cp === 0xd7 || cp === 0xf7) {
			return Script.Common;
		}
		return Script.Latin;
	}

	// Latin Extended-A/B (U+0100–024F), IPA Extensions (U+0250–02AF)
	if (cp <= 0x02af) {
		return Script.Latin;
	}

	// Spacing Modifier Letters (U+02B0–02FF) — Common
	if (cp <= 0x02ff) {
		return Script.Common;
	}

	// Combining Diacritical Marks (U+0300–036F) — Inherited
	if (cp <= 0x036f) {
		return Script.Inherited;
	}

	// Greek and Coptic (U+0370–03FF)
	if (cp <= 0x03ff) {
		if (cp >= 0x0370) {
			// Coptic letters embedded in Greek block have Script=Coptic → Other
			if (cp >= 0x03e2 && cp <= 0x03ef) {
				return Script.Other;
			}
			return Script.Greek;
		}
		return Script.Common;
	}

	// Cyrillic (U+0400–04FF) + Supplement (U+0500–052F)
	if (cp >= 0x0400 && cp <= 0x052f) {
		return Script.Cyrillic;
	}

	// Armenian (U+0530–058F)
	if (cp >= 0x0530 && cp <= 0x058f) {
		return Script.Armenian;
	}

	// Hebrew (U+0590–05FF)
	if (cp >= 0x0590 && cp <= 0x05ff) {
		return Script.Hebrew;
	}

	// Arabic (U+0600–06FF)
	if (cp >= 0x0600 && cp <= 0x06ff) {
		// Arabic combining marks with Script=Inherited
		if ((cp >= 0x064b && cp <= 0x0655) || cp === 0x0670) {
			return Script.Inherited;
		}
		return Script.Arabic;
	}

	// Arabic Supplement (U+0750–077F), Extended-A (U+08A0–08FF)
	if ((cp >= 0x0750 && cp <= 0x077f) || (cp >= 0x08a0 && cp <= 0x08ff)) {
		return Script.Arabic;
	}

	// Indic scripts (U+0900–0D7F)
	if (cp >= 0x0900 && cp <= 0x0d7f) {
		if (cp <= 0x097f) {
			return Script.Devanagari;
		}
		if (cp <= 0x09ff) {
			return Script.Bengali;
		}
		if (cp <= 0x0a7f) {
			return Script.Gurmukhi;
		}
		if (cp <= 0x0aff) {
			return Script.Gujarati;
		}
		if (cp <= 0x0b7f) {
			return Script.Oriya;
		}
		if (cp <= 0x0bff) {
			return Script.Tamil;
		}
		if (cp <= 0x0c7f) {
			return Script.Telugu;
		}
		if (cp <= 0x0cff) {
			return Script.Kannada;
		}
		return Script.Malayalam;
	}

	// Thai (U+0E00–0E7F)
	if (cp >= 0x0e00 && cp <= 0x0e7f) {
		return Script.Thai;
	}

	// Lao (U+0E80–0EFF)
	if (cp >= 0x0e80 && cp <= 0x0eff) {
		return Script.Lao;
	}

	// Tibetan (U+0F00–0FFF)
	if (cp >= 0x0f00 && cp <= 0x0fff) {
		return Script.Tibetan;
	}

	// Myanmar (U+1000–109F)
	if (cp >= 0x1000 && cp <= 0x109f) {
		return Script.Myanmar;
	}

	// Georgian (U+10A0–10FF)
	if (cp >= 0x10a0 && cp <= 0x10ff) {
		return Script.Georgian;
	}

	// Hangul Jamo (U+1100–11FF)
	if (cp >= 0x1100 && cp <= 0x11ff) {
		return Script.Hangul;
	}

	// Ethiopic (U+1200–139F)
	if (cp >= 0x1200 && cp <= 0x139f) {
		return Script.Ethiopic;
	}

	// Cyrillic Extended-C (U+1C80–1C8F)
	if (cp >= 0x1c80 && cp <= 0x1c8f) {
		return Script.Cyrillic;
	}

	// Georgian Extended (U+1C90–1CBF)
	if (cp >= 0x1c90 && cp <= 0x1cbf) {
		return Script.Georgian;
	}

	// Phonetic Extensions (U+1D00–1DBF) — Latin
	if (cp >= 0x1d00 && cp <= 0x1dbf) {
		return Script.Latin;
	}

	// Combining Diacritical Marks Supplement (U+1DC0–1DFF) — Inherited
	if (cp >= 0x1dc0 && cp <= 0x1dff) {
		return Script.Inherited;
	}

	// Latin Extended Additional (U+1E00–1EFF)
	if (cp >= 0x1e00 && cp <= 0x1eff) {
		return Script.Latin;
	}

	// Greek Extended (U+1F00–1FFF)
	if (cp >= 0x1f00 && cp <= 0x1fff) {
		return Script.Greek;
	}

	// General Punctuation (U+2000–206F) — Common
	if (cp >= 0x2000 && cp <= 0x206f) {
		return Script.Common;
	}

	// Combining Diacritical Marks for Symbols (U+20D0–20FF) — Inherited
	if (cp >= 0x20d0 && cp <= 0x20ff) {
		return Script.Inherited;
	}

	// Misc Symbols, Dingbats, etc. (U+2600–27BF) — Common
	if (cp >= 0x2600 && cp <= 0x27bf) {
		return Script.Common;
	}

	// Georgian Supplement (U+2D00–2D2F)
	if (cp >= 0x2d00 && cp <= 0x2d2f) {
		return Script.Georgian;
	}

	// Ethiopic Extended (U+2D80–2DDF)
	if (cp >= 0x2d80 && cp <= 0x2ddf) {
		return Script.Ethiopic;
	}

	// Cyrillic Extended-A (U+2DE0–2DFF)
	if (cp >= 0x2de0 && cp <= 0x2dff) {
		return Script.Cyrillic;
	}

	// Kangxi Radicals (U+2F00–2FDF) — Han
	if (cp >= 0x2f00 && cp <= 0x2fdf) {
		return Script.Han;
	}

	// CJK Symbols and Punctuation (U+3000–303F) — Common
	if (cp >= 0x3000 && cp <= 0x303f) {
		return Script.Common;
	}

	// Hiragana (U+3040–309F)
	if (cp >= 0x3040 && cp <= 0x309f) {
		// U+3099–309A are combining voiced/semi-voiced sound marks (Inherited)
		if (cp >= 0x3099 && cp <= 0x309a) {
			return Script.Inherited;
		}
		return Script.Hiragana;
	}

	// Katakana (U+30A0–30FF)
	if (cp >= 0x30a0 && cp <= 0x30ff) {
		return Script.Katakana;
	}

	// Bopomofo (U+3100–312F)
	if (cp >= 0x3100 && cp <= 0x312f) {
		return Script.Bopomofo;
	}

	// Hangul Compatibility Jamo (U+3130–318F)
	if (cp >= 0x3130 && cp <= 0x318f) {
		return Script.Hangul;
	}

	// Bopomofo Extended (U+31A0–31BF)
	if (cp >= 0x31a0 && cp <= 0x31bf) {
		return Script.Bopomofo;
	}

	// Katakana Phonetic Extensions (U+31F0–31FF)
	if (cp >= 0x31f0 && cp <= 0x31ff) {
		return Script.Katakana;
	}

	// CJK Unified Ideographs Extension A (U+3400–4DBF)
	if (cp >= 0x3400 && cp <= 0x4dbf) {
		return Script.Han;
	}

	// CJK Unified Ideographs (U+4E00–9FFF)
	if (cp >= 0x4e00 && cp <= 0x9fff) {
		return Script.Han;
	}

	// Hangul Jamo Extended-A (U+A960–A97F)
	if (cp >= 0xa960 && cp <= 0xa97f) {
		return Script.Hangul;
	}

	// Hangul Syllables (U+AC00–D7AF)
	if (cp >= 0xac00 && cp <= 0xd7af) {
		return Script.Hangul;
	}

	// Hangul Jamo Extended-B (U+D7B0–D7FF)
	if (cp >= 0xd7b0 && cp <= 0xd7ff) {
		return Script.Hangul;
	}

	// Cyrillic Extended-B (U+A640–A69F)
	if (cp >= 0xa640 && cp <= 0xa69f) {
		return Script.Cyrillic;
	}

	// Latin Extended-D (U+A720–A7FF)
	if (cp >= 0xa720 && cp <= 0xa7ff) {
		return Script.Latin;
	}

	// Myanmar Extended-A (U+AA60–AA7F)
	if (cp >= 0xaa60 && cp <= 0xaa7f) {
		return Script.Myanmar;
	}

	// Latin Extended-E (U+AB30–AB6F)
	if (cp >= 0xab30 && cp <= 0xab6f) {
		return Script.Latin;
	}

	// CJK Compatibility Ideographs (U+F900–FAFF) — Han
	if (cp >= 0xf900 && cp <= 0xfaff) {
		return Script.Han;
	}

	// Latin ligatures (U+FB00–FB06)
	if (cp >= 0xfb00 && cp <= 0xfb06) {
		return Script.Latin;
	}

	// Hebrew Presentation Forms (U+FB1D–FB4F)
	if (cp >= 0xfb1d && cp <= 0xfb4f) {
		return Script.Hebrew;
	}

	// Arabic Presentation Forms-A (U+FB50–FDFF)
	if (cp >= 0xfb50 && cp <= 0xfdff) {
		return Script.Arabic;
	}

	// Combining Half Marks (U+FE20–FE2F) — Inherited
	if (cp >= 0xfe20 && cp <= 0xfe2f) {
		return Script.Inherited;
	}

	// Arabic Presentation Forms-B (U+FE70–FEFF)
	if (cp >= 0xfe70 && cp <= 0xfeff) {
		return Script.Arabic;
	}

	// CJK Unified Ideographs Extensions B–I (U+20000–323AF) — Han
	if (cp >= 0x20000 && cp <= 0x323af) {
		return Script.Han;
	}

	// CJK Compatibility Ideographs Supplement (U+2F800–2FA1F) — Han
	if (cp >= 0x2f800 && cp <= 0x2fa1f) {
		return Script.Han;
	}

	return Script.Other;
};

/**
 * detects the Unicode script of a character.
 * uses code-point range tables instead of regex for performance.
 * @param ch the character (single code point as string)
 * @returns the detected script
 */
export const getScript = (ch: string): Script => {
	return getScriptFromCp(ch.codePointAt(0)!);
};

/**
 * detects the Unicode script of a code point number.
 * @param cp the code point
 * @returns the detected script
 */
export const getScriptByCodePoint = (cp: number): Script => {
	return getScriptFromCp(cp);
};

// #endregion

// #region script combo table

// meta-script groups used in the combo table
type ScriptGroup = (typeof SG)[keyof typeof SG];
const SG = {
	Bopo: 0,
	Cyrl: 1,
	Grek: 2,
	Hang: 3,
	Hani: 4,
	Hira: 5,
	Kata: 6,
	Latn: 7,
	Othr: 8,
} as const;

// maps Script → ScriptGroup for combo table lookup
const toGroup = (s: Script): ScriptGroup => {
	switch (s) {
		case Script.Bopomofo:
			return SG.Bopo;
		case Script.Cyrillic:
			return SG.Cyrl;
		case Script.Greek:
			return SG.Grek;
		case Script.Hangul:
			return SG.Hang;
		case Script.Han:
			return SG.Hani;
		case Script.Hiragana:
			return SG.Hira;
		case Script.Katakana:
			return SG.Kata;
		case Script.Latin:
			return SG.Latn;
		default:
			return SG.Othr;
	}
};

// allowed script group combinations (adapted from Firefox's scriptComboTable).
// each entry is a bitmask of ScriptGroups that may appear together in a label.
// bit position = ScriptGroup value (e.g., SG.Bopo=0 → bit 0, SG.Latn=7 → bit 7).
const allowedCombos: number[] = [
	/* Latn+Hani+Hira+Kata */ (1 << SG.Latn) | (1 << SG.Hani) | (1 << SG.Hira) | (1 << SG.Kata),
	/* Latn+Hani+Bopo      */ (1 << SG.Latn) | (1 << SG.Hani) | (1 << SG.Bopo),
	/* Latn+Hani+Hang      */ (1 << SG.Latn) | (1 << SG.Hani) | (1 << SG.Hang),
	/* Latn+Hani            */ (1 << SG.Latn) | (1 << SG.Hani),
	/* Hani+Hira+Kata       */ (1 << SG.Hani) | (1 << SG.Hira) | (1 << SG.Kata),
	/* Hani+Hira            */ (1 << SG.Hani) | (1 << SG.Hira),
	/* Hani+Kata            */ (1 << SG.Hani) | (1 << SG.Kata),
	/* Hani+Bopo            */ (1 << SG.Hani) | (1 << SG.Bopo),
	/* Hani+Hang            */ (1 << SG.Hani) | (1 << SG.Hang),
	/* Hira+Kata            */ (1 << SG.Hira) | (1 << SG.Kata),
	/* Latn+Hira+Kata       */ (1 << SG.Latn) | (1 << SG.Hira) | (1 << SG.Kata),
	/* Latn+Hira            */ (1 << SG.Latn) | (1 << SG.Hira),
	/* Latn+Kata            */ (1 << SG.Latn) | (1 << SG.Kata),
	/* Latn+Bopo            */ (1 << SG.Latn) | (1 << SG.Bopo),
	/* Latn+Hang            */ (1 << SG.Latn) | (1 << SG.Hang),
];

/**
 * checks whether the given set of scripts forms a legal combination within a
 * single label. scripts like Common and Inherited are ignored (they mix freely).
 * @param scripts the set of scripts found in a label
 * @returns true if the combination is allowed
 */
export const isScriptComboAllowed = (scripts: Set<Script>): boolean => {
	// build bitmask of significant script groups
	let mask = 0;
	for (const s of scripts) {
		if (s === Script.Common || s === Script.Inherited) {
			continue;
		}
		mask |= 1 << toGroup(s);
	}

	// single script or none is always fine
	if ((mask & (mask - 1)) === 0) {
		return true;
	}

	// "Other" script group must not mix with anything except itself
	if (mask & (1 << SG.Othr)) {
		return mask === 1 << SG.Othr;
	}

	// check against allowed combinations
	for (const combo of allowedCombos) {
		if ((mask & combo) === mask) {
			return true;
		}
	}

	return false;
};

// #endregion
