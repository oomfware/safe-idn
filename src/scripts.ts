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

const scriptTests: [RegExp, Script][] = [
	[/\p{Script=Latin}/u, Script.Latin],
	[/\p{Script=Cyrillic}/u, Script.Cyrillic],
	[/\p{Script=Greek}/u, Script.Greek],
	[/\p{Script=Han}/u, Script.Han],
	[/\p{Script=Hiragana}/u, Script.Hiragana],
	[/\p{Script=Katakana}/u, Script.Katakana],
	[/\p{Script=Hangul}/u, Script.Hangul],
	[/\p{Script=Bopomofo}/u, Script.Bopomofo],
	[/\p{Script=Arabic}/u, Script.Arabic],
	[/\p{Script=Armenian}/u, Script.Armenian],
	[/\p{Script=Bengali}/u, Script.Bengali],
	[/\p{Script=Devanagari}/u, Script.Devanagari],
	[/\p{Script=Ethiopic}/u, Script.Ethiopic],
	[/\p{Script=Georgian}/u, Script.Georgian],
	[/\p{Script=Gujarati}/u, Script.Gujarati],
	[/\p{Script=Gurmukhi}/u, Script.Gurmukhi],
	[/\p{Script=Hebrew}/u, Script.Hebrew],
	[/\p{Script=Kannada}/u, Script.Kannada],
	[/\p{Script=Lao}/u, Script.Lao],
	[/\p{Script=Malayalam}/u, Script.Malayalam],
	[/\p{Script=Myanmar}/u, Script.Myanmar],
	[/\p{Script=Oriya}/u, Script.Oriya],
	[/\p{Script=Tamil}/u, Script.Tamil],
	[/\p{Script=Telugu}/u, Script.Telugu],
	[/\p{Script=Thai}/u, Script.Thai],
	[/\p{Script=Tibetan}/u, Script.Tibetan],
	[/\p{Script=Common}/u, Script.Common],
	[/\p{Script=Inherited}/u, Script.Inherited],
];

/**
 * detects the Unicode script of a code point.
 * @param ch the character (single code point as string)
 * @returns the detected script
 */
export const getScript = (ch: string): Script => {
	for (const [re, script] of scriptTests) {
		if (re.test(ch)) {
			return script;
		}
	}
	return Script.Other;
};

/**
 * detects the Unicode script of a code point number.
 * @param cp the code point
 * @returns the detected script
 */
export const getScriptByCodePoint = (cp: number): Script => {
	return getScript(String.fromCodePoint(cp));
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
