#!/usr/bin/env node
// generates src/data/confusables.ts from Unicode's confusables.txt
//
// usage:
//   node --experimental-strip-types scripts/generate-confusables.ts
//
// fetches https://unicode.org/Public/security/latest/confusables.txt
// and parses it into a Map<number, string> mapping source code points to
// replacement strings.

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../src/data/confusables.ts');

const CONFUSABLES_URL = 'https://unicode.org/Public/security/latest/confusables.txt';

// #region VLQ encoding

// 92 safe printable ASCII chars for JS strings (33-126 minus " and \).
// split into two halves of 46 for continuation/terminal signaling:
//   indices 0-45: continuation digits (more bytes follow)
//   indices 46-91: terminal digits (last byte of number)
const VLQ_BASE = 46;

const indexToChar = (i: number): string => {
	let c = i + 33;
	if (c >= 34) c++; // skip "
	if (c >= 92) c++; // skip \
	return String.fromCharCode(c);
};

// encode a non-negative integer as VLQ
const encodeVlq = (val: number): string => {
	if (val < VLQ_BASE) {
		return indexToChar(val + VLQ_BASE); // terminal
	}

	// big-endian: collect digits, most significant first
	const digits: number[] = [];
	while (val >= VLQ_BASE) {
		digits.push(val % VLQ_BASE);
		val = Math.floor(val / VLQ_BASE);
	}
	digits.push(val);
	digits.reverse();

	let out = '';
	for (let i = 0; i < digits.length - 1; i++) {
		out += indexToChar(digits[i]); // continuation
	}
	out += indexToChar(digits[digits.length - 1] + VLQ_BASE); // terminal
	return out;
};

// verify round-trip
const decodeVlq = (str: string, pos: number): [number, number] => {
	let val = 0;
	let j = pos;
	while (true) {
		const c = str.charCodeAt(j++);
		const idx = c - 33 - (c > 34 ? 1 : 0) - (c > 92 ? 1 : 0);
		if (idx < VLQ_BASE) {
			val = val * VLQ_BASE + idx;
		} else {
			val = val * VLQ_BASE + (idx - VLQ_BASE);
			break;
		}
	}
	return [val, j];
};

// #endregion

async function main() {
	console.log(`fetching ${CONFUSABLES_URL}...`);
	const resp = await fetch(CONFUSABLES_URL);
	if (!resp.ok) {
		throw new Error(`fetch failed: ${resp.status} ${resp.statusText}`);
	}
	const text = await resp.text();

	const entries: [number, string][] = [];

	for (const line of text.split('\n')) {
		// skip comments and empty lines
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}

		// format: SOURCE ; TARGET ; TYPE
		// e.g.: 0041 ; 0391 ; MA
		const parts = trimmed.split(';');
		if (parts.length < 2) {
			continue;
		}

		const sourcePart = parts[0].trim();
		const targetPart = parts[1].trim();

		const sourceCP = parseInt(sourcePart, 16);
		if (isNaN(sourceCP)) {
			continue;
		}

		// target can be multiple code points separated by spaces
		const targetCPs = targetPart.split(/\s+/).map((s) => parseInt(s, 16));
		if (targetCPs.some(isNaN)) {
			continue;
		}

		const targetStr = String.fromCodePoint(...targetCPs);
		entries.push([sourceCP, targetStr]);
	}

	// Chromium adds extra mappings beyond Unicode's list.
	// "chromium extras" override Unicode confusables to map directly to ASCII
	// where the upstream maps to intermediate IPA/phonetic forms.
	// "skeleton extras" are from skeleton.ts's extraConfusables — characters that
	// need direct ASCII mappings for skeleton matching (Cyrillic extensions, IPA,
	// small capitals). merged here so the runtime doesn't need a separate map.
	const extraMappings: [number, string][] = [
		[0x00df, 'ss'], // ß → ss (deviation character)
		// Cyrillic к/ĸ/Greek κ → k
		[0x043a, 'k'], // к
		[0x0138, 'k'], // ĸ (Kra)
		[0x03ba, 'k'], // κ
		// Cyrillic п → n
		[0x043f, 'n'],
		// Cyrillic г → r
		[0x0433, 'r'],
		// skeleton extras: small capital Latin letters
		[0x0299, 'b'], // ʙ
		[0x0262, 'g'], // ɢ
		[0x029c, 'h'], // ʜ
		[0x1d0e, 'n'], // ᴎ
		[0x1d19, 'r'], // ᴙ
		[0x1d1b, 't'], // ᴛ
		// skeleton extras: IPA characters
		[0x028d, 'm'], // ʍ
		[0x0278, 'f'], // ɸ
		[0x025c, 'e'], // ɜ
		// skeleton extras: other non-ASCII Latin
		[0x0185, 'b'], // ƅ
		[0x0245, 'v'], // Ʌ
		[0x021d, 'z'], // ȝ
		[0xa793, 'c'], // ꞓ
		// skeleton extras: extended Cyrillic with Latin lookalikes
		[0x0449, 'w'], // щ
		[0x0491, 'r'], // ґ
		[0x0493, 'r'], // ғ
		[0x048f, 'p'], // ҏ
		[0x049d, 'k'], // ҝ
		[0x04a1, 'k'], // ҡ
		[0x04a5, 'n'], // ҥ
		[0x04b3, 'x'], // ҳ
		[0x04c4, 'k'], // ӄ
		[0x04fb, 'f'], // ӻ
		[0x04fd, 'x'], // ӽ
		[0x04ff, 'x'], // ӿ
		[0x0503, 'd'], // ԃ
		[0x050b, 'n'], // ԋ
		[0x050f, 't'], // ԏ
		[0x051f, 'q'], // ԟ
		[0x0525, 'p'], // ԥ
		[0x0527, 'n'], // ԧ
		[0x0529, 'n'], // ԩ
	];

	// merge: extra mappings override Unicode ones
	const map = new Map(entries);
	for (const [cp, target] of extraMappings) {
		map.set(cp, target);
	}

	// pre-resolve confusable chains: apply the map to each value repeatedly
	// until stable. this lets the runtime use a single-pass lookup instead of
	// the two-pass resolveConfusables approach.
	function resolveValue(val: string): string {
		let out = '';
		for (const ch of val) {
			const cp = ch.codePointAt(0)!;
			out += map.get(cp) ?? ch;
		}
		return out;
	}

	let changed = true;
	while (changed) {
		changed = false;
		for (const [key, val] of map) {
			const resolved = resolveValue(val);
			if (resolved !== val) {
				map.set(key, resolved);
				changed = true;
			}
		}
	}

	// sort by code point for deterministic output
	// oxlint-disable-next-line unicorn/no-array-sort
	const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);

	// filter to entries whose prototypes produce ASCII after stripping combining
	// marks. the skeleton is only compared against ASCII top domain names via
	// skeletonStripDiacritics, so entries that resolve to non-ASCII base
	// characters are never useful. combining marks are stripped from values
	// since skeletonStripDiacritics removes them anyway.
	const combiningMarkRe = /\p{M}/gu;
	const filtered = sorted
		.map(([cp, val]): [number, string] => [cp, val.replace(combiningMarkRe, '')])
		.filter(([, val]) => val.length > 0 && Array.from(val).every((ch) => ch.codePointAt(0)! <= 0x7f));

	// compact encoding: separator-free base-46 VLQ for delta-encoded keys,
	// pipe-delimited values. 92 safe printable ASCII chars are split into
	// continuation (0-45) and terminal (46-91) halves, encoding each delta
	// as a variable-length quantity without needing separators between entries.
	let prev = 0;
	let keyStr = '';
	const values: string[] = [];
	for (const [cp, target] of filtered) {
		const delta = cp - prev;
		keyStr += encodeVlq(delta - 1); // delta >= 1, encode delta-1
		values.push(target);
		prev = cp;
	}

	const valStr = values.join('|');

	// verify round-trip
	{
		let p = 0;
		let j = 0;
		const testVals = valStr.split('|');
		let vi = 0;
		while (j < keyStr.length) {
			const [val, nextJ] = decodeVlq(keyStr, j);
			j = nextJ;
			p += val + 1;
			const expected = filtered[vi];
			if (p !== expected[0]) {
				throw new Error(`key mismatch at ${vi}: got ${p}, expected ${expected[0]}`);
			}
			if (testVals[vi] !== expected[1]) {
				throw new Error(`value mismatch at ${vi}: got ${testVals[vi]}, expected ${expected[1]}`);
			}
			vi++;
		}
		if (vi !== filtered.length) {
			throw new Error(`entry count mismatch: decoded ${vi}, expected ${filtered.length}`);
		}
		console.log(`round-trip verification passed`);
	}

	let code = '// generated from Unicode confusables.txt — do not edit manually.\n';
	code += '// run `node --experimental-strip-types scripts/generate-confusables.ts` to regenerate.\n';
	code += '//\n';
	code += '// compact encoding: keys are delta-encoded using separator-free base-46 VLQ,\n';
	code += '// values are pipe-delimited. filtered to ASCII-only prototypes (combining\n';
	code += '// marks stripped) since the skeleton is only compared against ASCII top\n';
	code += '// domain names. decoded at load time into a Map.\n\n';

	code += `const k = ${JSON.stringify(keyStr)};\n`;
	code += `const v = ${JSON.stringify(valStr)};\n\n`;

	code += `/** confusable character map: source code point → replacement string */\n`;
	code += `export const confusableMap: Map<number, string> = /* #__PURE__ */ (() => {\n`;
	code += `\tconst s = v.split('|');\n`;
	code += `\tconst m = new Map<number, string>();\n`;
	code += `\tlet p = 0;\n`;
	code += `\tlet j = 0;\n`;
	code += `\tlet i = 0;\n`;
	code += `\twhile (j < k.length) {\n`;
	code += `\t\tlet d = 0;\n`;
	code += `\t\twhile (true) {\n`;
	code += `\t\t\tconst c = k.charCodeAt(j++);\n`;
	code += `\t\t\tconst x = c - 33 - (c > 34 ? 1 : 0) - (c > 92 ? 1 : 0);\n`;
	code += `\t\t\tif (x < 46) {\n`;
	code += `\t\t\t\td = d * 46 + x;\n`;
	code += `\t\t\t} else {\n`;
	code += `\t\t\t\td = d * 46 + x - 46;\n`;
	code += `\t\t\t\tbreak;\n`;
	code += `\t\t\t}\n`;
	code += `\t\t}\n`;
	code += `\t\tp += d + 1;\n`;
	code += `\t\tm.set(p, s[i++]);\n`;
	code += `\t}\n`;
	code += `\treturn m;\n`;
	code += `})();\n`;

	writeFileSync(OUTPUT, code);
	console.log(
		`wrote ${filtered.length} entries (${keyStr.length + valStr.length} bytes packed, from ${sorted.length} total) to ${OUTPUT}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
