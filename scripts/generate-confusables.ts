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

const URL = 'https://unicode.org/Public/security/latest/confusables.txt';

async function main() {
	console.log(`fetching ${URL}...`);
	const resp = await fetch(URL);
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
	const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);

	// compact encoding: delta-encoded keys (base36) + pipe-delimited values.
	// this is ~3x smaller than a Map constructor literal.
	let prev = 0;
	const deltas: string[] = [];
	const values: string[] = [];
	for (const [cp, target] of sorted) {
		deltas.push((cp - prev).toString(36));
		prev = cp;
		values.push(target);
	}

	const deltaStr = deltas.join(',');
	const valStr = values.join('|');

	let code = '// generated from Unicode confusables.txt — do not edit manually.\n';
	code += '// run `node --experimental-strip-types scripts/generate-confusables.ts` to regenerate.\n';
	code += '//\n';
	code += '// compact encoding: keys are delta-encoded in base36 (comma-separated),\n';
	code += '// values are pipe-delimited. decoded at load time into a Map.\n\n';

	code += `const k = ${JSON.stringify(deltaStr)};\n`;
	code += `const v = ${JSON.stringify(valStr)};\n\n`;

	code += `/** confusable character map: source code point → replacement string */\n`;
	code += `export const confusableMap: Map<number, string> = /* #__PURE__ */ (() => {\n`;
	code += `\tconst d = k.split(',');\n`;
	code += `\tconst s = v.split('|');\n`;
	code += `\tconst m = new Map<number, string>();\n`;
	code += `\tlet p = 0;\n`;
	code += `\tfor (let i = 0; i < d.length; i++) {\n`;
	code += `\t\tp += parseInt(d[i], 36);\n`;
	code += `\t\tm.set(p, s[i]);\n`;
	code += `\t}\n`;
	code += `\treturn m;\n`;
	code += `})();\n`;

	writeFileSync(OUTPUT, code);
	console.log(
		`wrote ${sorted.length} entries (${deltaStr.length + valStr.length} bytes packed) to ${OUTPUT}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
