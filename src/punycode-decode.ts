// punycode decoder — RFC 3492
// only the decode side; encode is not needed by this codebase

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 0x80;
const MAX_INT = 0x7fffffff;

const adapt = (delta: number, numPoints: number, first: boolean): number => {
	delta = first ? Math.floor(delta / DAMP) : delta >> 1;
	delta += Math.floor(delta / numPoints);
	let k = 0;
	while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
		delta = Math.floor(delta / (BASE - T_MIN));
		k += BASE;
	}
	return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + SKEW));
};

const basicToDigit = (cp: number): number => {
	if (cp >= 0x30 && cp < 0x3a) {
		return 26 + (cp - 0x30);
	}
	if (cp >= 0x41 && cp < 0x5b) {
		return cp - 0x41;
	}
	if (cp >= 0x61 && cp < 0x7b) {
		return cp - 0x61;
	}
	return BASE;
};

/**
 * decodes a punycode string (without the `xn--` prefix) into a Unicode string.
 *
 * @param input the punycode-encoded string (after stripping `xn--`)
 * @returns the decoded Unicode string
 * @throws RangeError on invalid input
 */
export const punycodeDecode = (input: string): string => {
	const output: number[] = [];
	const len = input.length;

	let i = 0;
	let n = INITIAL_N;
	let bias = INITIAL_BIAS;

	const lastDelim = input.lastIndexOf('-');
	const basic = lastDelim < 0 ? 0 : lastDelim;

	for (let j = 0; j < basic; j++) {
		const cp = input.charCodeAt(j);
		if (cp >= 0x80) {
			throw new RangeError(`illegal input: non-basic character`);
		}
		output.push(cp);
	}

	let idx = basic > 0 ? basic + 1 : 0;

	while (idx < len) {
		const oldi = i;
		let w = 1;

		for (let k = BASE; ; k += BASE) {
			if (idx >= len) {
				throw new RangeError(`invalid input: unexpected end`);
			}

			const digit = basicToDigit(input.charCodeAt(idx++));
			if (digit >= BASE) {
				throw new RangeError(`invalid input: bad digit`);
			}
			if (digit > Math.floor((MAX_INT - i) / w)) {
				throw new RangeError(`overflow`);
			}

			i += digit * w;
			const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;

			if (digit < t) {
				break;
			}

			const baseMinusT = BASE - t;
			if (w > Math.floor(MAX_INT / baseMinusT)) {
				throw new RangeError(`overflow`);
			}
			w *= baseMinusT;
		}

		const out = output.length + 1;
		bias = adapt(i - oldi, out, oldi === 0);

		if (Math.floor(i / out) > MAX_INT - n) {
			throw new RangeError(`overflow`);
		}

		n += Math.floor(i / out);
		i %= out;

		output.splice(i++, 0, n);
	}

	return String.fromCodePoint(...output);
};
