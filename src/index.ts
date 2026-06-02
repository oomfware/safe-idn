import { checkLabel } from './label-checker.ts';
import type { LabelResult } from './label-checker.ts';

// #region types

export interface DomainCheckResult {
	/** the safe display string */
	display: string;
	/** per-label verdicts */
	labels: LabelResult[];
}

export type { LabelResult };

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

// #endregion

// #region public API

/**
 * checks domain safety and returns detailed per-label results.
 * each label is checked independently for script mixing, confusable characters,
 * dangerous patterns, and other safety issues, following the per-label portion of
 * Chromium's IDN display algorithm.
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

	const results: LabelResult[] = [];
	for (const label of inputLabels) {
		if (label === '') {
			results.push({ input: '', unicode: '', result: 'safe' });
			continue;
		}
		results.push(checkLabel(label, tld));
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
