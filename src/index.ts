import { topDomainNames } from './data/top-domains.ts';
import { toUnicode } from './idna.ts';
import { checkLabel } from './label-checker.ts';
import type { LabelResult, SkeletonChecker } from './label-checker.ts';
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
 * built-in skeleton checker that detects confusables by comparing
 * label skeletons against top domain skeletons.
 */
const defaultSkeletonChecker: SkeletonChecker = (label) => {
	const skel = skeletonStripDiacritics(label);
	if (topDomainSkeletons.has(skel)) {
		return true;
	}

	// also check ß variants: ß can spoof 'b' (visual), 's', or 'ss'
	if (label.includes('\u00df')) {
		const variants = ['b', 's', 'ss'];
		for (const replacement of variants) {
			const variant = label.replace(/\u00df/g, replacement);
			if (topDomainSkeletons.has(skeletonStripDiacritics(variant))) {
				return true;
			}
		}
	}

	return false;
};

// #endregion

// #region TLD extraction

function extractTld(labels: string[]): string {
	if (labels.length === 0) {
		return '';
	}
	let tldIdx = labels.length - 1;
	if (labels[tldIdx] === '' && tldIdx > 0) {
		tldIdx--;
	}
	return labels[tldIdx].toLowerCase();
}

// known two-part public suffixes
const twoPartSuffixes = new Set([
	'co.uk',
	'co.in',
	'co.jp',
	'co.kr',
	'co.nz',
	'co.za',
	'com.au',
	'com.br',
	'com.cn',
	'com.mx',
	'com.tw',
	'com.sg',
	'org.uk',
	'net.uk',
	'ac.uk',
]);

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

function isIdnTldSpoofingAscii(tld: string): boolean {
	if (!tld.startsWith('xn--')) {
		return false;
	}
	const decoded = toUnicode(tld, {});
	if (decoded.error) {
		return false;
	}
	const skel = skeletonStripDiacritics(decoded.domain);
	return commonAsciiTlds.has(skel);
}

function getRegistrableLabelIndex(labels: string[]): number {
	const len = labels.length;
	const end = len > 0 && labels[len - 1] === '' ? len - 1 : len;
	if (end <= 1) {
		return 0;
	}

	if (end >= 3) {
		const suffix = `${labels[end - 2]}.${labels[end - 1]}`.toLowerCase();
		if (twoPartSuffixes.has(suffix)) {
			return end - 3;
		}
	}
	return end - 2;
}

// #endregion

// #region public API

/**
 * checks domain safety and returns detailed per-label results.
 * each label is checked independently for script mixing, confusable characters,
 * and other safety issues following Chromium's IDN display algorithm.
 *
 * @param domain the domain to check (may contain punycode labels)
 * @returns detailed check results including per-label verdicts
 */
export function checkDomain(domain: string): DomainCheckResult {
	if (domain === '' || domain === '.') {
		return {
			display: domain,
			labels: [{ input: domain, unicode: domain, result: 'safe' }],
		};
	}

	const inputLabels = domain.split('.');
	const tld = extractTld(inputLabels);
	const registrableIdx = getRegistrableLabelIndex(inputLabels);

	// check if TLD is an IDN that spoofs a standard ASCII TLD
	const tldIsSpoofed = isIdnTldSpoofingAscii(tld);

	const results: LabelResult[] = [];

	for (let i = 0; i < inputLabels.length; i++) {
		const label = inputLabels[i];

		if (label === '') {
			results.push({ input: '', unicode: '', result: 'safe' });
			continue;
		}

		// apply skeleton top-domain check to the registrable label,
		// or to all non-ASCII labels when TLD is a spoofed IDN
		const isRegistrable = i === registrableIdx;
		const checker = isRegistrable || tldIsSpoofed ? defaultSkeletonChecker : undefined;
		results.push(checkLabel(label, tld, checker));
	}

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
}

/**
 * returns the safe display form of a domain.
 * labels that pass all safety checks are shown as Unicode;
 * labels that fail are kept as punycode (ASCII).
 *
 * @param domain the domain to process (may contain punycode labels)
 * @returns the safe display string
 */
export function safeDisplay(domain: string): string {
	return checkDomain(domain).display;
}

// #endregion
