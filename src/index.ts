import { topDomainNames } from './data/top-domains.ts';
import { toUnicode } from './idna.ts';
import { checkLabel } from './label-checker.ts';
import type { LabelResult } from './label-checker.ts';
import { skeletonStripDiacritics } from './skeleton.ts';

// #region types

export interface DomainCheckResult {
	/** the safe display string */
	display: string;
	/** per-label verdicts */
	labels: LabelResult[];
}

export type { LabelResult };

// #endregion

// #region skeleton checker

// pre-compute skeleton forms of top domains
const topDomainSkeletons = new Set(topDomainNames.map((d) => skeletonStripDiacritics(d)));

/**
 * checks if a label's skeleton matches a top domain name.
 * also handles ß variants (ß can visually spoof 'b', 's', or 'ss').
 */
const labelMatchesTopDomain = (unicode: string): boolean => {
	const skel = skeletonStripDiacritics(unicode);
	if (topDomainSkeletons.has(skel)) {
		return true;
	}

	if (unicode.includes('\u00df')) {
		const variants = ['b', 's', 'ss'];
		for (const replacement of variants) {
			const variant = unicode.replace(/\u00df/g, replacement);
			if (topDomainSkeletons.has(skeletonStripDiacritics(variant))) {
				return true;
			}
		}
	}

	return false;
};

/**
 * applies skeleton-based top domain checks to labels.
 * checks all non-TLD labels, but excludes subdomains of recognized
 * top domains (if a later label also matches, the current label is
 * a subdomain and should not be flagged).
 *
 * when the TLD is an IDN spoofing a common ASCII TLD, all labels
 * are checked unconditionally (no subdomain exclusion).
 */
const applySkeletonChecks = (results: LabelResult[], tldIsSpoofed: boolean): void => {
	// find the TLD index (last non-empty label)
	let tldIdx = results.length - 1;
	if (tldIdx >= 0 && results[tldIdx].unicode === '') {
		tldIdx--;
	}

	for (let i = 0; i < results.length; i++) {
		const r = results[i];

		// skip labels that already failed or are the TLD
		if (r.result !== 'safe' || i === tldIdx) {
			continue;
		}

		// only check labels with non-ASCII content
		if (!/[^\x00-\x7f]/.test(r.unicode)) {
			continue;
		}

		if (!labelMatchesTopDomain(r.unicode)) {
			continue;
		}

		if (!tldIsSpoofed) {
			// subdomain exclusion: if a subsequent non-TLD label also matches
			// a top domain, this label is a subdomain and should stay safe.
			// e.g., éxample.test.net → éxample is a subdomain of test
			let isSubdomain = false;
			for (let j = i + 1; j < results.length && j !== tldIdx; j++) {
				if (results[j].unicode !== '' && labelMatchesTopDomain(results[j].unicode)) {
					isSubdomain = true;
					break;
				}
			}
			if (isSubdomain) {
				continue;
			}
		}

		results[i] = { input: r.input, unicode: r.unicode, result: 'unsafe' };
	}
};

// #endregion

// #region TLD extraction

const extractTld = (labels: string[]): string => {
	if (labels.length === 0) {
		return '';
	}
	let tldIdx = labels.length - 1;
	if (labels[tldIdx] === '' && tldIdx > 0) {
		tldIdx--;
	}
	return labels[tldIdx].toLowerCase();
};

// common ASCII TLDs — if an IDN TLD's skeleton matches one of these,
// the domain might be spoofing a standard TLD
const commonAsciiTlds = new Set([
	'com',
	'net',
	'org',
	'edu',
	'gov',
	'mil',
	'int',
	'de',
	'uk',
	'fr',
	'jp',
	'cn',
	'ru',
	'br',
	'au',
	'in',
	'kr',
	'it',
	'es',
	'nl',
	'se',
	'no',
	'fi',
	'dk',
	'ch',
	'at',
	'be',
	'pt',
	'pl',
	'cz',
	'ie',
	'nz',
	'za',
	'mx',
	'ar',
	'co',
	'cl',
	'pe',
	'tw',
	'sg',
	'hk',
	'my',
	'th',
	'ph',
	'vn',
	'id',
	'il',
	'tr',
	'ua',
	'eg',
	'ng',
	'ke',
	'io',
	'me',
	'tv',
	'cc',
	'info',
	'biz',
	'name',
	'pro',
]);

const isIdnTldSpoofingAscii = (tld: string): boolean => {
	if (!tld.startsWith('xn--')) {
		return false;
	}
	const decoded = toUnicode(tld);
	if (decoded.error) {
		return false;
	}
	const skel = skeletonStripDiacritics(decoded.domain);
	return commonAsciiTlds.has(skel);
};

// #endregion

// #region public API

/**
 * checks domain safety and returns detailed per-label results.
 * each label is checked independently for script mixing, confusable characters,
 * and other safety issues following Chromium's IDN display algorithm.
 * a second pass applies skeleton-based top domain matching to all non-TLD labels.
 *
 * @param domain the domain to check (may contain punycode labels)
 * @returns detailed check results including per-label verdicts
 */
export const checkDomain = (domain: string): DomainCheckResult => {
	if (domain === '' || domain === '.') {
		return {
			display: domain,
			labels: [{ input: domain, unicode: domain, result: 'safe' }],
		};
	}

	const inputLabels = domain.split('.');
	const tld = extractTld(inputLabels);
	const tldIsSpoofed = isIdnTldSpoofingAscii(tld);

	// phase 1: per-label safety checks (script mixing, confusables, etc.)
	const results: LabelResult[] = [];

	for (const label of inputLabels) {
		if (label === '') {
			results.push({ input: '', unicode: '', result: 'safe' });
			continue;
		}
		results.push(checkLabel(label, tld));
	}

	// phase 2: skeleton-based top domain matching
	applySkeletonChecks(results, tldIsSpoofed);

	const displayParts = results.map((r) => {
		if (r.result === 'safe') {
			return r.unicode;
		}
		return r.input;
	});

	return {
		display: displayParts.join('.'),
		labels: results,
	};
};

/**
 * returns the safe display form of a domain.
 * labels that pass all safety checks are shown as Unicode;
 * labels that fail are kept as punycode (ASCII).
 *
 * @param domain the domain to process (may contain punycode labels)
 * @returns the safe display string
 */
export const safeDisplay = (domain: string): string => {
	return checkDomain(domain).display;
};

// #endregion
