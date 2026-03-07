import { Script, getScriptByCodePoint } from './scripts.ts';

// #region whole-script confusable character sets

// for each script, the set of characters that have Latin lookalikes.
// if ALL non-Common/Inherited characters in a label are in this set,
// the label is a whole-script confusable.
// curated from Chromium's kWholeScriptConfusables data.
//
// packed format: delta-encoded code points in base36, comma-separated within
// each set, pipe-separated between sets. order matches scriptEntries below.

const packedConfusables =
	'ts,3,2,5,4,1,1,1,1,1,2,5,1,1,2,7,1,2,9,k,1y,2,i,1e,c,a,4,2|12o,1,1,2,1,3,1,1,1,2,2,1,1,1,1,1,1,1|q9,8,1,3,2,2,3,1,2,2,1f|3bk,5,4,1,2,1,1,2,1,3,1,2,1,3,2,1,1,1,d,1,1|15f,4,a,3|35s,1,1,1,1,8,4,1,1,2,1,8,4,v,1,1,1,1,1,1,1,1,1,b,1o,1,1,1,1,1,1,1|3k0,8,8,8,8,8,8,g,w,g,w,g,8,w,8,8,g,w,1k,8,8|2rl,p,4,1,4,t,g|2v5,p,4,1,4,b,y|1ye,1,1,1,1,1,1,1,1,1|1tp,15,1,1,1,1,1,1,1,1,1|23j,2,1x,1,1,1,1,1,1,1,1,1|21y,1,1,1,1,1|2il,15,1,1,1,1,1,1,1,1,1|2lb,1,7|274,1y,1,1,1,1,1,1,1,1,1|2an,b|2g6,1,1,1,1,1,1,1,1,1';

const confusableSets: Set<number>[] = /* #__PURE__ */ packedConfusables.split('|').map((group) => {
	const set = new Set<number>();
	let cp = 0;
	for (const d of group.split(',')) {
		cp += parseInt(d, 36);
		set.add(cp);
	}
	return set;
});

// Cyrillic words explicitly allowed even though they are whole-script confusable.
// from Chromium's kAllowedWholeScriptConfusableWords.
const allowedCyrillicWords = new Set([
	'\u0441\u0435\u043a\u0441', // секс
	'\u043a\u0430\u043a', // как
	'\u043a\u043e\u0441\u0430', // коса
	'\u043a\u0443\u0440\u0441', // курс
	'\u043f\u0430\u0440\u043a', // парк
	'\u0442\u0430\u043a\u0438\u0439', // такий
	'\u0443\u043a\u0440\u043e\u043f', // укроп
	'\u0441\u0430\u0445\u0430\u0440\u043e\u043a', // сахарок
	'\u043f\u043e\u043a\u0440\u0430\u0441\u043a\u0430', // покраска
	'\u0442\u0435\u0430\u0442\u0440', // театр
	'\u0430\u0441\u0442\u0440\u043e', // астро
	'\u043f\u0445\u0443\u043a\u0435\u0442', // пхукет
]);

// #endregion

// #region script → confusable set mapping

interface ScriptEntry {
	script: Script;
	confusables: Set<number>;
	allowedTlds: Set<string>;
}

// order must match packedConfusables above
const scriptEntries: ScriptEntry[] = [
	{
		script: Script.Cyrillic,
		confusables: confusableSets[0],
		allowedTlds: new Set([
			'ru',
			'su',
			'ua',
			'by',
			'kz',
			'uz',
			'bg',
			'xn--p1ai',
			'xn--90a3ac',
			'xn--d1alf',
			'xn--90ae',
		]),
	},
	{ script: Script.Armenian, confusables: confusableSets[1], allowedTlds: new Set(['am', 'xn--y9a3aq']) },
	{ script: Script.Greek, confusables: confusableSets[2], allowedTlds: new Set(['gr', 'xn--qxam']) },
	{ script: Script.Georgian, confusables: confusableSets[3], allowedTlds: new Set(['ge', 'xn--node']) },
	{
		script: Script.Hebrew,
		confusables: confusableSets[4],
		allowedTlds: new Set(['il', 'xn--7dbh4a', 'xn--9dbq2a']),
	},
	{ script: Script.Myanmar, confusables: confusableSets[5], allowedTlds: new Set(['mm', 'xn--7idjb0f4ck']) },
	{
		script: Script.Ethiopic,
		confusables: confusableSets[6],
		allowedTlds: new Set(['et', 'xn--m0d3gwjla96a']),
	},
	{ script: Script.Thai, confusables: confusableSets[7], allowedTlds: new Set(['th', 'xn--o3cw4h']) },
	{ script: Script.Lao, confusables: confusableSets[8], allowedTlds: new Set(['la']) },
	{ script: Script.Bengali, confusables: confusableSets[9], allowedTlds: new Set(['bd', 'in']) },
	{ script: Script.Devanagari, confusables: confusableSets[10], allowedTlds: new Set(['in', 'np']) },
	{ script: Script.Gujarati, confusables: confusableSets[11], allowedTlds: new Set(['in']) },
	{ script: Script.Gurmukhi, confusables: confusableSets[12], allowedTlds: new Set(['in']) },
	{ script: Script.Kannada, confusables: confusableSets[13], allowedTlds: new Set(['in']) },
	{ script: Script.Malayalam, confusables: confusableSets[14], allowedTlds: new Set(['in']) },
	{ script: Script.Oriya, confusables: confusableSets[15], allowedTlds: new Set(['in']) },
	{ script: Script.Tamil, confusables: confusableSets[16], allowedTlds: new Set(['in', 'lk', 'sg']) },
	{ script: Script.Telugu, confusables: confusableSets[17], allowedTlds: new Set(['in']) },
];

// #endregion

// #region whole-script confusable check

/**
 * checks if all letter characters in a label are whole-script confusables
 * for a single non-Latin script. if so, and the TLD is not in the allowlist,
 * the label is unsafe.
 *
 * only applies to scripts with curated confusable sets (not CJK scripts).
 *
 * @param codePoints the code points of the label
 * @param labelScript the single non-Common/Inherited script of the label
 * @param tld the top-level domain
 * @param labelText the label text (for allowed word checks)
 * @returns true if the label is a whole-script confusable that should be blocked
 */
export function isWholeScriptConfusable(
	codePoints: number[],
	labelScript: Script | null,
	tld: string,
	labelText: string,
): boolean {
	if (labelScript === null || labelScript === Script.Latin || labelScript === Script.Common) {
		return false;
	}

	for (const entry of scriptEntries) {
		if (entry.script !== labelScript) {
			continue;
		}

		// skip if TLD is in the allowlist for this script
		if (entry.allowedTlds.has(tld)) {
			return false;
		}

		// check if ALL non-Common/Inherited characters are in the confusable set
		const letterCps = codePoints.filter((cp) => {
			const s = getScriptByCodePoint(cp);
			return s !== Script.Common && s !== Script.Inherited;
		});

		if (letterCps.length === 0) {
			return false;
		}

		if (!letterCps.every((cp) => entry.confusables.has(cp))) {
			return false;
		}

		// check against allowed words for Cyrillic
		if (labelScript === Script.Cyrillic && allowedCyrillicWords.has(labelText)) {
			return false;
		}

		return true;
	}

	// script not in our confusable table → not a whole-script confusable
	return false;
}

// #endregion
