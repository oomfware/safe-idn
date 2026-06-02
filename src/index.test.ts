import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkDomain } from './index.ts';

function checkResult(domain: string, expectedUnicode?: string): Result {
	const result = checkDomain(domain);
	// a domain is 'invalid' if any label is invalid
	for (const label of result.labels) {
		if (label.result === 'invalid') {
			return Result.Invalid;
		}
	}
	// compare display form against expected unicode.
	// if display matches expected unicode, the domain is displayed safely.
	// if not, at least one label failed safety and is shown as punycode.
	if (expectedUnicode !== undefined && result.display === expectedUnicode) {
		return Result.Safe;
	}
	for (const label of result.labels) {
		if (label.result === 'unsafe') {
			return Result.Unsafe;
		}
	}
	return Result.Safe;
}

// expected result of the IDN safety check.
const Result = {
	Safe: 0,
	Unsafe: 1,
	Invalid: 2,
} as const;
type Result = (typeof Result)[keyof typeof Result];

const ResultName = ['Safe', 'Unsafe', 'Invalid'] as const;

interface IdnTestCase {
	// the IDNA/Punycode domain (plain ASCII)
	input: string;
	// the equivalent Unicode domain
	unicode: string;
	// whether we expect the domain to be displayed as Unicode or punycode
	expected: Result;
}

// test cases ported from Chromium's idn_spoof_checker_unittest.cc
// source: https://github.com/chromium/chromium/blob/main/components/url_formatter/spoof_checks/idn_spoof_checker_unittest.cc
//
// these were originally generated with Chromium's idn_test_case_generator.py
// to independently verify correctness using Python's IDN encoder.

// #region test data
const kIdnCases: IdnTestCase[] = [
	// no IDN
	{ input: 'www.google.com', unicode: 'www.google.com', expected: Result.Safe },
	{ input: 'www.google.com.', unicode: 'www.google.com.', expected: Result.Safe },
	{ input: '.', unicode: '.', expected: Result.Safe },
	{ input: '', unicode: '', expected: Result.Safe },

	// invalid IDN
	{ input: 'xn--example-.com', unicode: 'xn--example-.com', expected: Result.Invalid },

	// Hanzi (Traditional Chinese)
	{ input: 'xn--1lq90ic7f1rc.cn', unicode: '\u5317\u4eac\u5927\u5b78.cn', expected: Result.Safe },
	// Hanzi ('video' in Simplified Chinese)
	{ input: 'xn--cy2a840a.com', unicode: '\u89c6\u9891.com', expected: Result.Safe },
	// Hanzi + '123'
	{ input: 'www.xn--123-p18d.com', unicode: 'www.\u4e00123.com', expected: Result.Safe },
	// Hanzi + Latin : U+56FD is simplified
	{ input: 'www.xn--hello-9n1hm04c.com', unicode: 'www.hello\u4e2d\u56fd.com', expected: Result.Safe },
	// Kanji + Kana (Japanese)
	{ input: 'xn--l8jvb1ey91xtjb.jp', unicode: '\u671d\u65e5\u3042\u3055\u3072.jp', expected: Result.Safe },
	// Katakana including U+30FC
	{ input: 'xn--tckm4i2e.jp', unicode: '\u30b3\u30de\u30fc\u30b9.jp', expected: Result.Safe },
	{ input: 'xn--3ck7a7g.jp', unicode: '\u30ce\u30f3\u30bd.jp', expected: Result.Safe },
	// Katakana + Latin (Japanese)
	{ input: 'xn--e-efusa1mzf.jp', unicode: 'e\u30b3\u30de\u30fc\u30b9.jp', expected: Result.Safe },
	{ input: 'xn--3bkxe.jp', unicode: '\u30c8\u309a.jp', expected: Result.Safe },
	// Hangul (Korean)
	{ input: 'www.xn--or3b17p6jjc.kr', unicode: 'www.\uc804\uc790\uc815\ubd80.kr', expected: Result.Safe },
	// b<u-umlaut>cher (German)
	{ input: 'xn--bcher-kva.de', unicode: 'b\u00fccher.de', expected: Result.Safe },
	// a with diaeresis
	{ input: 'www.xn--frgbolaget-q5a.se', unicode: 'www.f\u00e4rgbolaget.se', expected: Result.Safe },
	// c-cedilla (French)
	{
		input: 'www.xn--alliancefranaise-npb.fr',
		unicode: 'www.alliancefran\u00e7aise.fr',
		expected: Result.Safe,
	},
	// cafe with acute accent (French)
	{ input: 'xn--caf-dma.fr', unicode: 'caf\u00e9.fr', expected: Result.Safe },
	// c-cedilla and a with tilde (Portuguese)
	{ input: 'xn--poema-9qae5a.com.br', unicode: 'p\u00e3oema\u00e7\u00e3.com.br', expected: Result.Safe },
	// s with caron
	{ input: 'xn--achy-f6a.com', unicode: '\u0161achy.com', expected: Result.Safe },
	// Greek
	{
		input: 'xn--kxae4bafwg.gr',
		unicode: '\u03bf\u03c5\u03c4\u03bf\u03c0\u03af\u03b1.gr',
		expected: Result.Safe,
	},
	// Eutopia + 123 (Greek)
	{
		input: 'xn---123-pldm0haj2bk.gr',
		unicode: '\u03bf\u03c5\u03c4\u03bf\u03c0\u03af\u03b1-123.gr',
		expected: Result.Safe,
	},
	// Cyrillic (Russian)
	{ input: 'xn--n1aeec9b.ru', unicode: '\u0442\u043e\u0440\u0442\u044b.ru', expected: Result.Safe },
	// Cyrillic + 123 (Russian)
	{ input: 'xn---123-45dmmc5f.ru', unicode: '\u0442\u043e\u0440\u0442\u044b-123.ru', expected: Result.Safe },
	// 'president' in Russian — wholescript confusable, but allowed
	{
		input: 'xn--d1abbgf6aiiy.xn--p1ai',
		unicode: '\u043f\u0440\u0435\u0437\u0438\u0434\u0435\u043d\u0442.\u0440\u0444',
		expected: Result.Safe,
	},
	// Arabic
	{ input: 'xn--mgba1fmg.eg', unicode: '\u0627\u0641\u0644\u0627\u0645.eg', expected: Result.Safe },
	// Hebrew
	{ input: 'xn--4dbib.he', unicode: '\u05d5\u05d0\u05d4.he', expected: Result.Safe },
	// Hebrew + Common
	{
		input: 'xn---123-ptf2c5c6bt.il',
		unicode: '\u05e2\u05d1\u05e8\u05d9\u05ea-123.il',
		expected: Result.Safe,
	},
	// Thai
	{
		input: 'xn--12c2cc4ag3b4ccu.th',
		unicode: '\u0e2a\u0e32\u0e22\u0e01\u0e32\u0e23\u0e1a\u0e34\u0e19.th',
		expected: Result.Safe,
	},
	// Thai + Common
	{
		input: 'xn---123-9goxcp8c9db2r.th',
		unicode: '\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22-123.th',
		expected: Result.Safe,
	},
	// Devanagari (Hindi)
	{
		input: 'www.xn--l1b6a9e1b7c.in',
		unicode: 'www.\u0905\u0915\u094b\u0932\u093e.in',
		expected: Result.Safe,
	},
	// Devanagari + Common
	{
		input: 'xn---123-kbjl2j0bl2k.in',
		unicode: '\u0939\u093f\u0928\u094d\u0926\u0940-123.in',
		expected: Result.Safe,
	},

	// block mixed numeric + numeric lookalike
	{ input: 'xn--1-xcc.com', unicode: '1\u0577.com', expected: Result.Unsafe },
	// block mixed numeric lookalike + numeric
	{ input: 'xn--0-6ee.com', unicode: '\u0a680.com', expected: Result.Unsafe },
	// block fully numeric lookalikes
	{ input: 'xn--47b6w.com', unicode: '\u09ea\u0a68.com', expected: Result.Unsafe },
	// block single script digit lookalikes
	{ input: 'xn--qccaa.com', unicode: '\u0a68\u0a68\u0a68.com', expected: Result.Unsafe },

	// Georgian 'd' 4000.com
	{ input: 'xn--4000-pfr.com', unicode: '\u10eb4000.com', expected: Result.Unsafe },

	// aspirational scripts (no longer defined in UAX 31)
	// Unified Canadian Syllabary
	{ input: 'xn--dfe0tte.ca', unicode: '\u1456\u14c2\u14ef.ca', expected: Result.Unsafe },
	// Tifinagh
	{
		input: 'xn--4ljxa2bb4a6bxb.ma',
		unicode: '\u2d5c\u2d49\u2d3c\u2d49\u2d4f\u2d30\u2d56.ma',
		expected: Result.Unsafe,
	},
	// Tifinagh with a disallowed character (U+2D6F)
	{
		input: 'xn--hmjzaby5d5f.ma',
		unicode: '\u2d5c\u2d49\u2d3c\u2d6f\u2d49\u2d4f.ma',
		expected: Result.Invalid,
	},
	// Yi
	{ input: 'xn--4o7a6e1x64c.cn', unicode: '\ua188\ua320\ua071\ua0b7.cn', expected: Result.Unsafe },
	// Mongolian
	{ input: 'xn--56ec8bp.cn', unicode: '\u1823\u1837\u1833\u1824.cn', expected: Result.Unsafe },
	// Mongolian with disallowed character
	{ input: 'xn--95e5de3ds.cn', unicode: '\u1823\u1837\u1804\u1833\u1824.cn', expected: Result.Unsafe },
	// Miao/Pollard
	{ input: 'xn--2u0fpf0a.cn', unicode: '\u{16f04}\u{16f62}\u{16f59}.cn', expected: Result.Unsafe },

	// script mixing tests
	// "payp<alpha>l.com"
	{ input: 'xn--paypl-g9d.com', unicode: 'payp\u03b1l.com', expected: Result.Unsafe },
	// google.gr with Greek omicron and epsilon
	{ input: 'xn--ggl-6xc1ca.gr', unicode: 'g\u03bf\u03bfgl\u03b5.gr', expected: Result.Unsafe },
	// google.ru with Cyrillic o
	{ input: 'xn--ggl-tdd6ba.ru', unicode: 'g\u043e\u043egl\u0435.ru', expected: Result.Unsafe },
	// h<e with acute>llo<China in Han>.cn
	{ input: 'xn--hllo-bpa7979ih5m.cn', unicode: 'h\u00e9llo\u4e2d\u56fd.cn', expected: Result.Unsafe },
	// <Greek rho><Cyrillic a><Cyrillic u>.ru
	{ input: 'xn--2xa6t2b.ru', unicode: '\u03c1\u0430\u0443.ru', expected: Result.Unsafe },
	// Georgian + Latin
	{ input: 'xn--abcef-vuu.test', unicode: 'abc\u10ebef.test', expected: Result.Unsafe },
	// Hangul + Latin
	{ input: 'xn--han-eb9ll88m.kr', unicode: '\ud55c\uae00han.kr', expected: Result.Safe },
	// Hangul + Latin + Han with IDN ccTLD
	{
		input: 'xn--han-or0kq92gkm3c.xn--3e0b707e',
		unicode: '\ud55c\uae00han\u97d3.\ud55c\uad6d',
		expected: Result.Safe,
	},
	// non-ASCII Latin + Hangul
	{ input: 'xn--caf-dma9024xvpg.kr', unicode: 'caf\u00e9\uce74\ud398.kr', expected: Result.Unsafe },
	// Hangul + Hiragana
	{ input: 'xn--y9j3b9855e.kr', unicode: '\ud55c\u3072\u3089.kr', expected: Result.Unsafe },
	// <Hiragana>.<Hangul> is allowed because script mixing check is per label
	{ input: 'xn--y9j3b.xn--3e0b707e', unicode: '\u3072\u3089.\ud55c\uad6d', expected: Result.Safe },
	// Traditional Han + Latin
	{ input: 'xn--hanzi-u57ii69i.tw', unicode: '\u6f22\u5b57hanzi.tw', expected: Result.Safe },
	// Simplified Han + Latin
	{ input: 'xn--hanzi-u57i952h.cn', unicode: '\u6c49\u5b57hanzi.cn', expected: Result.Safe },
	// Simplified Han + Traditional Han
	{ input: 'xn--hanzi-if9kt8n.cn', unicode: '\u6c49\u6f22hanzi.cn', expected: Result.Safe },
	// Han + Hiragana + Katakana + Latin
	{
		input: 'xn--kanji-ii4dpizfq59yuykqr4b.jp',
		unicode: '\u632f\u308a\u4eee\u540d\u30ab\u30bfkanji.jp',
		expected: Result.Safe,
	},
	// Han + Bopomofo
	{
		input: 'xn--5ekcde0577e87tc.tw',
		unicode: '\u6ce8\u97f3\u3105\u3106\u3107\u3108.tw',
		expected: Result.Safe,
	},
	// Han + Latin + Bopomofo
	{
		input: 'xn--bopo-ty4cghi8509kk7xd.tw',
		unicode: '\u6ce8\u97f3bopo\u3105\u3106\u3107\u3108.tw',
		expected: Result.Safe,
	},
	// Latin + Bopomofo
	{
		input: 'xn--bopomofo-hj5gkalm.tw',
		unicode: 'bopomofo\u3105\u3106\u3107\u3108.tw',
		expected: Result.Safe,
	},
	// Bopomofo + Katakana
	{
		input: 'xn--lcka3d1bztghi.tw',
		unicode: '\u3105\u3106\u3107\u3108\u30ab\u30bf\u30ab\u30ca.tw',
		expected: Result.Unsafe,
	},
	// Bopomofo + Hangul
	{
		input: 'xn--5ekcde4543qbec.tw',
		unicode: '\u3105\u3106\u3107\u3108\uc8fc\uc74c.tw',
		expected: Result.Unsafe,
	},
	// Devanagari + Latin
	{
		input: 'xn--ab-3ofh8fqbj6h.in',
		unicode: 'ab\u0939\u093f\u0928\u094d\u0926\u0940.in',
		expected: Result.Unsafe,
	},
	// Thai + Latin
	{
		input: 'xn--ab-jsi9al4bxdb6n.th',
		unicode: 'ab\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22.th',
		expected: Result.Unsafe,
	},
	// Armenian + Latin
	{ input: 'xn--bs-red.com', unicode: 'b\u057ds.com', expected: Result.Unsafe },
	// Tibetan + Latin
	{ input: 'xn--foo-vkm.com', unicode: 'foo\u0f37.com', expected: Result.Unsafe },
	// Oriya + Latin
	{ input: 'xn--fo-h3g.com', unicode: 'fo\u0b66.com', expected: Result.Unsafe },
	// Gujarati + Latin
	{ input: 'xn--fo-isg.com', unicode: 'fo\u0ae6.com', expected: Result.Unsafe },
	// <vitamin in Katakana>b1.com
	{ input: 'xn--b1-xi4a7cvc9f.com', unicode: '\u30d3\u30bf\u30df\u30f3b1.com', expected: Result.Safe },
	// Devanagari + Han
	{
		input: 'xn--t2bes3ds6749n.com',
		unicode: '\u0930\u094b\u0932\u0947\u76e7\u0938.com',
		expected: Result.Unsafe,
	},
	// Devanagari + Bengali
	{ input: 'xn--11b0x.in', unicode: '\u0915\u0995.in', expected: Result.Unsafe },
	// Canadian Syllabary + Latin
	{ input: 'xn--ab-lym.com', unicode: 'ab\u14bf.com', expected: Result.Unsafe },
	{ input: 'xn--ab1-p6q.com', unicode: 'ab1\u14bf.com', expected: Result.Unsafe },
	{ input: 'xn--1ab-m6qd.com', unicode: '\u14bf1ab\u14bf.com', expected: Result.Unsafe },
	{ input: 'xn--ab-jymc.com', unicode: '\u14bfab\u14bf.com', expected: Result.Unsafe },
	// Tifinagh + Latin
	{ input: 'xn--liy-bq1b.com', unicode: 'li\u2d4fy.com', expected: Result.Unsafe },
	{ input: 'xn--rol-cq1b.com', unicode: 'rol\u2d4f.com', expected: Result.Unsafe },
	{ input: 'xn--ily-8p1b.com', unicode: '\u2d4fily.com', expected: Result.Unsafe },
	{ input: 'xn--1ly-8p1b.com', unicode: '\u2d4f1ly.com', expected: Result.Unsafe },

	// invisibility checks
	// Thai tone mark malek (U+0E48) repeated
	{ input: 'xn--03c0b3ca.th', unicode: '\u0e23\u0e35\u0e48\u0e48.th', expected: Result.Unsafe },
	// acute accent repeated
	{ input: 'xn--a-xbba.com', unicode: 'a\u0301\u0301.com', expected: Result.Invalid },
	// 'a' with acute accent + another acute accent
	{ input: 'xn--1ca20i.com', unicode: '\u00e1\u0301.com', expected: Result.Unsafe },
	// combining mark at the beginning
	{ input: 'xn--abc-fdc.jp', unicode: '\u0300abc.jp', expected: Result.Invalid },

	// dangerous patterns (extension of blocking repeated diacritics)
	// i followed by U+0307 (combining dot above)
	{ input: 'xn--pixel-8fd.com', unicode: 'pi\u0307xel.com', expected: Result.Unsafe },
	// U+0131 (dotless i) followed by U+0307
	{ input: 'xn--pxel-lza43z.com', unicode: 'p\u0131\u0307xel.com', expected: Result.Unsafe },
	// j followed by U+0307
	{ input: 'xn--jack-qwc.com', unicode: 'j\u0307ack.com', expected: Result.Unsafe },
	// l followed by U+0307
	{ input: 'xn--lace-qwc.com', unicode: 'l\u0307ace.com', expected: Result.Unsafe },
	// combining mark after dotless i/j
	{ input: 'xn--pxel-lza29y.com', unicode: 'p\u0131\u0300xel.com', expected: Result.Unsafe },
	{ input: 'xn--ack-gpb42h.com', unicode: '\u0237\u0301ack.com', expected: Result.Unsafe },

	// mixed script confusable
	// google with Armenian Small Letter Oh (U+0585)
	{ input: 'xn--gogle-lkg.com', unicode: 'g\u0585ogle.com', expected: Result.Unsafe },
	{ input: 'xn--range-kkg.com', unicode: '\u0585range.com', expected: Result.Unsafe },
	{ input: 'xn--cucko-pkg.com', unicode: 'cucko\u0585.com', expected: Result.Unsafe },
	// Latin 'o' in Armenian
	{
		input: 'xn--o-ybcg0cu0cq.com',
		unicode: 'o\u0580\u0574\u0578\u0582\u0566\u0568.com',
		expected: Result.Unsafe,
	},
	// Hiragana HE (U+3078) mixed with Katakana
	{
		input: 'xn--49jxi3as0d0fpc.com',
		unicode: '\u30e2\u30d2\u30fc\u30c8\u3078\u30d6\u30f3.com',
		expected: Result.Unsafe,
	},

	// U+30FC should be preceded by a Hiragana/Katakana
	// Katakana + U+30FC + Han
	{ input: 'xn--lck0ip02qw5ya.jp', unicode: '\u30ab\u30fc\u91ce\u7403.jp', expected: Result.Safe },
	// Hiragana + U+30FC + Han
	{ input: 'xn--u8j5tr47nw5ya.jp', unicode: '\u304b\u30fc\u91ce\u7403.jp', expected: Result.Safe },
	// U+30FC + Han
	{ input: 'xn--weka801xo02a.com', unicode: '\u30fc\u52d5\u753b\u30fc.com', expected: Result.Unsafe },
	// Han + U+30FC + Han
	{
		input: 'xn--wekz60nb2ay85atj0b.jp',
		unicode: '\u65e5\u672c\u30fc\u91ce\u7403.jp',
		expected: Result.Unsafe,
	},
	// U+30FC at the beginning
	{ input: 'xn--wek060nb2a.jp', unicode: '\u30fc\u65e5\u672c.jp', expected: Result.Unsafe },
	// Latin + U+30FC + Latin
	{ input: 'xn--abcdef-r64e.jp', unicode: 'abc\u30fcdef.jp', expected: Result.Unsafe },

	// U+30FB (・) not allowed next to Latin, but allowed otherwise
	// U+30FB + Han
	{ input: 'xn--vekt920a.jp', unicode: '\u30fb\u91ce.jp', expected: Result.Safe },
	// Han + U+30FB + Han
	{ input: 'xn--vek160nb2ay85atj0b.jp', unicode: '\u65e5\u672c\u30fb\u91ce\u7403.jp', expected: Result.Safe },
	// Latin + U+30FB + Latin
	{ input: 'xn--abcdef-k64e.jp', unicode: 'abc\u30fbdef.jp', expected: Result.Unsafe },
	// U+30FB + Latin
	{ input: 'xn--abc-os4b.jp', unicode: '\u30fbabc.jp', expected: Result.Unsafe },

	// U+30FD (ヽ) allowed only after Katakana
	{ input: 'xn--lck2i.jp', unicode: '\u30ab\u30fd.jp', expected: Result.Safe },
	{ input: 'xn--u8j7t.jp', unicode: '\u304b\u30fd.jp', expected: Result.Unsafe },
	{ input: 'xn--xek368f.jp', unicode: '\u4e00\u30fd.jp', expected: Result.Unsafe },
	{ input: 'xn--a-mju.jp', unicode: 'a\u30fd.jp', expected: Result.Unsafe },
	{ input: 'xn--a1-bo4a.jp', unicode: 'a1\u30fd.jp', expected: Result.Unsafe },

	// U+30FE (ヾ) allowed only after Katakana
	{ input: 'xn--lck4i.jp', unicode: '\u30ab\u30fe.jp', expected: Result.Safe },
	{ input: 'xn--u8j9t.jp', unicode: '\u304b\u30fe.jp', expected: Result.Unsafe },
	{ input: 'xn--yek168f.jp', unicode: '\u4e00\u30fe.jp', expected: Result.Unsafe },
	{ input: 'xn--a-oju.jp', unicode: 'a\u30fe.jp', expected: Result.Unsafe },
	{ input: 'xn--a1-eo4a.jp', unicode: 'a1\u30fe.jp', expected: Result.Unsafe },

	// Cyrillic labels made of Latin-look-alike Cyrillic letters
	// ѕсоре.com
	{ input: 'xn--e1argc3h.com', unicode: '\u0455\u0441\u043e\u0440\u0435.com', expected: Result.Unsafe },
	// ѕсоре123.com
	{
		input: 'xn--123-qdd8bmf3n.com',
		unicode: '\u0455\u0441\u043e\u0440\u0435123.com',
		expected: Result.Unsafe,
	},
	// ѕсоре-рау.com
	{
		input: 'xn----8sbn9akccw8m.com',
		unicode: '\u0455\u0441\u043e\u0440\u0435-\u0440\u0430\u0443.com',
		expected: Result.Unsafe,
	},
	// ѕсоре1рау.com
	{
		input: 'xn--1-8sbn9akccw8m.com',
		unicode: '\u0455\u0441\u043e\u0440\u04351\u0440\u0430\u0443.com',
		expected: Result.Unsafe,
	},
	// курс.com — wholescript confusable but курс is an allowed word
	{ input: 'xn--j1amdg.com', unicode: '\u043a\u0443\u0440\u0441.com', expected: Result.Safe },
	// ск.com — wholescript confusable
	{ input: 'xn--j1an.com', unicode: '\u0441\u043a.com', expected: Result.Unsafe },
	// теѕт.com — wholescript confusable
	{ input: 'xn--e1azb9e.com', unicode: '\u0442\u0435\u0455\u0442.com', expected: Result.Unsafe },

	// same as above three, but in IDN TLD (рф)
	{
		input: 'xn--e1argc3h.xn--p1ai',
		unicode: '\u0455\u0441\u043e\u0440\u0435.\u0440\u0444',
		expected: Result.Safe,
	},
	{
		input: 'xn--123-qdd8bmf3n.xn--p1ai',
		unicode: '\u0455\u0441\u043e\u0440\u0435123.\u0440\u0444',
		expected: Result.Safe,
	},
	{
		input: 'xn----8sbn9akccw8m.xn--p1ai',
		unicode: '\u0455\u0441\u043e\u0440\u0435-\u0440\u0430\u0443.\u0440\u0444',
		expected: Result.Safe,
	},
	{
		input: 'xn--1-8sbn9akccw8m.xn--p1ai',
		unicode: '\u0455\u0441\u043e\u0440\u04351\u0440\u0430\u0443.\u0440\u0444',
		expected: Result.Safe,
	},

	// same as above, but in .ru TLD
	{ input: 'xn--e1argc3h.ru', unicode: '\u0455\u0441\u043e\u0440\u0435.ru', expected: Result.Safe },
	{ input: 'xn--123-qdd8bmf3n.ru', unicode: '\u0455\u0441\u043e\u0440\u0435123.ru', expected: Result.Safe },
	{
		input: 'xn----8sbn9akccw8m.ru',
		unicode: '\u0455\u0441\u043e\u0440\u0435-\u0440\u0430\u0443.ru',
		expected: Result.Safe,
	},
	{
		input: 'xn--1-8sbn9akccw8m.ru',
		unicode: '\u0455\u0441\u043e\u0440\u04351\u0440\u0430\u0443.ru',
		expected: Result.Safe,
	},

	// ѕсоре-рау.한국 — label stays punycode, TLD decoded
	{
		input: 'xn----8sbn9akccw8m.xn--3e0b707e',
		unicode: 'xn----8sbn9akccw8m.\ud55c\uad6d',
		expected: Result.Safe,
	},

	// музей (museum) has characters without a Latin-look-alike
	{ input: 'xn--e1adhj9a.com', unicode: '\u043c\u0443\u0437\u0435\u0439.com', expected: Result.Safe },

	// ѕсоԗе.com — Cyrillic with Latin lookalikes
	{ input: 'xn--e1ari3f61c.com', unicode: '\u0455\u0441\u043e\u0517\u0435.com', expected: Result.Unsafe },
	// ыоԍ.com
	{ input: 'xn--n1az74c.com', unicode: '\u044b\u043e\u050d.com', expected: Result.Unsafe },
	// сю.com
	{ input: 'xn--q1a0a.com', unicode: '\u0441\u044e.com', expected: Result.Unsafe },
	// аьс.com
	{ input: 'xn--80a8a6a.com', unicode: '\u0430\u044c\u0441.com', expected: Result.Unsafe },

	// googlе.한국 — Cyrillic е. label stays punycode, TLD decoded
	{ input: 'xn--googl-3we.xn--3e0b707e', unicode: 'xn--googl-3we.\ud55c\uad6d', expected: Result.Safe },

	// combining diacritics after non-Latin-Greek-Cyrillic
	{ input: 'xn--rsa2568fvxya.com', unicode: '\ud55c\u0307\uae00.com', expected: Result.Unsafe },
	{ input: 'xn--rsa0336bjom.com', unicode: '\u6f22\u0307\u5b57.com', expected: Result.Unsafe },
	{
		input: 'xn--lsa922apb7a6do.com',
		unicode: '\u0928\u093e\u0917\u0930\u0940\u0301.com',
		expected: Result.Unsafe,
	},

	// blocklisted / combining / mixed-script chars in an ASCII-looking label
	// di̇gklmo68.com
	{ input: 'xn--digklmo68-6jf.com', unicode: 'di\u0307gklmo68.com', expected: Result.Unsafe },
	// digĸlmo68.com
	{ input: 'xn--diglmo68-omb.com', unicode: 'dig\u0138lmo68.com', expected: Result.Unsafe },
	// digkłmo68.com
	{ input: 'xn--digkmo68-9ob.com', unicode: 'digk\u0142mo68.com', expected: Result.Unsafe },
	// digklṃo68.com
	{ input: 'xn--digklo68-l89c.com', unicode: 'digkl\u1e43o68.com', expected: Result.Unsafe },
	// digklmoб8.com
	{ input: 'xn--digklmo8-h7g.com', unicode: 'digklmo\u04318.com', expected: Result.Unsafe },
	// digklmo6৪.com
	{ input: 'xn--digklmo6-7yr.com', unicode: 'digklmo6\u09ea.com', expected: Result.Unsafe },

	// whole-script Cyrillic confusable of an ASCII-looking label
	{
		input: 'xn--123-bed4a4a6hh40i.com',
		unicode: '\u0456\u0455\u04cf\u043a\u0440\u0445123.com',
		expected: Result.Unsafe,
	},

	// digit lookalike tests
	// Bengali
	{ input: 'xn--07be.com', unicode: '\u09e6\u09e8.com', expected: Result.Unsafe },
	{ input: 'xn--27be.com', unicode: '\u09e8\u09ea.com', expected: Result.Unsafe },
	{ input: 'xn--77ba.com', unicode: '\u09ed\u09ed.com', expected: Result.Unsafe },
	// Gurmukhi
	{ input: 'xn--qcce.com', unicode: '\u0a68\u0a6a.com', expected: Result.Unsafe },
	{ input: 'xn--occe.com', unicode: '\u0a66\u0a68.com', expected: Result.Unsafe },
	{ input: 'xn--rccd.com', unicode: '\u0a6b\u0a69.com', expected: Result.Unsafe },
	{ input: 'xn--pcca.com', unicode: '\u0a67\u0a67.com', expected: Result.Unsafe },
	// Telugu
	{ input: 'xn--drcb.com', unicode: '\u0c69\u0c68.com', expected: Result.Unsafe },
	// Devanagari
	{ input: 'xn--d4be.com', unicode: '\u0966\u0968.com', expected: Result.Unsafe },
	// Kannada
	{ input: 'xn--yucg.com', unicode: '\u0ce6\u0ce9.com', expected: Result.Unsafe },
	{ input: 'xn--yuco.com', unicode: '\u0ce6\u0ced.com', expected: Result.Unsafe },
	// Oriya
	{ input: 'xn--1jcf.com', unicode: '\u0b6b\u0b68.com', expected: Result.Unsafe },
	{ input: 'xn--zjca.com', unicode: '\u0b66\u0b66.com', expected: Result.Unsafe },
	// Gujarati
	{ input: 'xn--cgce.com', unicode: '\u0ae6\u0ae8.com', expected: Result.Unsafe },
	{ input: 'xn--fgci.com', unicode: '\u0ae9\u0aed.com', expected: Result.Unsafe },
	{ input: 'xn--dgca.com', unicode: '\u0ae7\u0ae7.com', expected: Result.Unsafe },

	// Cyrillic whole-script confusable Latin lookalikes
	// ഠട345.com
	{ input: 'xn--345-jtke.com', unicode: '\u0d20\u0d1f345.com', expected: Result.Unsafe },

	// additional confusable LGC characters
	{ input: 'xn--mxar4bh6w.com', unicode: '\u03fc\u03ba\u03b1\u03c9\u03c7.com', expected: Result.Unsafe },
	{ input: 'xn--vda6f3b2kpf.com', unicode: '\u00fe\u0127\u0138\u0167\u0185.com', expected: Result.Unsafe },
	{ input: 'xn--hktb-9ra.com', unicode: '\u00fehktb.com', expected: Result.Unsafe },
	{ input: 'xn--pktb-5xa.com', unicode: 'p\u0127ktb.com', expected: Result.Unsafe },
	{ input: 'xn--phtb-m0a.com', unicode: 'ph\u0138tb.com', expected: Result.Unsafe },
	{ input: 'xn--phkb-d7a.com', unicode: 'phk\u0167b.com', expected: Result.Unsafe },
	{ input: 'xn--phkt-ocb.com', unicode: 'phkt\u0185.com', expected: Result.Unsafe },
	// wmŋr.com
	{ input: 'xn--wmr-jxa.com', unicode: 'wm\u014br.com', expected: Result.Unsafe },

	// U+04CF mapped to multiple characters
	{ input: 'xn--s5a8j.com', unicode: '\u04cf\u050d.com', expected: Result.Unsafe },

	// digit confusable characters
	{ input: 'xn--134567890-gnk.com', unicode: '1\u057734567890.com', expected: Result.Unsafe },
	{ input: 'xn--23457890-e7g93622b.com', unicode: '\ua4f22345\u04317890.com', expected: Result.Unsafe },
	{ input: 'xn--13457890-e7g0943b.com', unicode: '1\u14bf345\u04317890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-10h.com', unicode: '12\u04374567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-1ti.com', unicode: '12\u04994567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-mfj.com', unicode: '12\u04e14567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-m3r.com', unicode: '12\u09094567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-17s.com', unicode: '12\u09934567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-hfu.com', unicode: '12\u0a244567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-6s6a.com', unicode: '12\u10124567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-we8a.com', unicode: '12\u10D54567890.com', expected: Result.Unsafe },
	{ input: 'xn--124567890-hh8a.com', unicode: '12\u10DE4567890.com', expected: Result.Unsafe },
	{ input: 'xn--123567890-dr5h.com', unicode: '123\u3110567890.com', expected: Result.Unsafe },
	{ input: 'xn--123567890-dm4b.com', unicode: '123\u13ce567890.com', expected: Result.Unsafe },
	{ input: 'xn--123457890-fmk.com', unicode: '12345\u05737890.com', expected: Result.Unsafe },
	{ input: 'xn--123456780-71w.com', unicode: '12345678\u0b680.com', expected: Result.Unsafe },
	{ input: 'xn--123456789-ohw.com', unicode: '123456789\u0b20.com', expected: Result.Unsafe },
	{ input: 'xn--123456789-tx75a.com', unicode: '123456789\ua4f3.com', expected: Result.Unsafe },

	// aeœ.com
	{ input: 'xn--ae-fsa.com', unicode: 'ae\u0153.com', expected: Result.Unsafe },
	// æce.com
	{ input: 'xn--ce-0ia.com', unicode: '\u00e6ce.com', expected: Result.Unsafe },
	// æœ.com
	{ input: 'xn--6ca2t.com', unicode: '\u00e6\u0153.com', expected: Result.Unsafe },
	// ӕԥ.com

	// Myanmar (entirely Myanmar characters)
	{ input: 'xn--ridq5c9hnd.com', unicode: '\u1004\u1054\u100c\u1042\u101d.com', expected: Result.Unsafe },

	// Thai characters similar to wsws.com
	{ input: 'xn--w3calb.com', unicode: '\u0e1f\u0e23\u0e1f\u0e23.com', expected: Result.Unsafe },
	{ input: 'xn--r3chp.com', unicode: '\u0e1e\u0e23\u0e1a.com', expected: Result.Unsafe },
	{ input: 'xn--r3cjm.com', unicode: '\u0e1f\u0e23\u0e1a.com', expected: Result.Unsafe },

	// Lao characters that look like w, s, o, u
	{ input: 'xn--f7chp.com', unicode: '\u0e9e\u0ea3\u0e9a.com', expected: Result.Unsafe },
	{ input: 'xn--f7cjm.com', unicode: '\u0e9f\u0ea3\u0e9a.com', expected: Result.Unsafe },
	{ input: 'xn--f7cj9b.com', unicode: '\u0e9f\u0eae\u0e9a.com', expected: Result.Unsafe },
	{ input: 'xn--f7cj9b5h.com', unicode: '\u0e9f\u0eae\u0ed0\u0e9a.com', expected: Result.Unsafe },
	// Lao character that looks like n
	{ input: 'xn--11-lqi.com', unicode: '\u0e0111.com', expected: Result.Unsafe },

	// mixed digits
	{ input: 'xn--asc1deva-j0q.co.in', unicode: 'asc1deva\u0967.co.in', expected: Result.Unsafe },
	{ input: 'xn--devabeng-f0qu3f.co.in', unicode: 'deva\u0967beng\u09e7.co.in', expected: Result.Unsafe },
	{ input: 'xn--79-v5f.co.in', unicode: '7\u09ea9.co.in', expected: Result.Unsafe },
	{ input: 'xn--e4b0x.co.in', unicode: '\u0967\u09e7.co.in', expected: Result.Unsafe },
	// U+4E00 not allowed next to non-Kana scripts
	{ input: 'xn--d12-s18d.cn', unicode: 'd12\u4e00.cn', expected: Result.Unsafe },

	// long domain forcing buffer realloc
	{
		input: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		unicode: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
		expected: Result.Safe,
	},

	// not allowed: characters outside [:Identifier_Status=Allowed:]
	// Vai
	{ input: 'xn--sn8a.com', unicode: '\ua50b.com', expected: Result.Unsafe },
	// Cherokee 'CARD' look-alike
	{ input: 'xn--58db0a9q.com', unicode: '\u13df\u13aa\u13a1\u13a0.com', expected: Result.Unsafe },
	// Coptic
	{ input: 'xn--5ya.com', unicode: '\u03e7.com', expected: Result.Unsafe },
	// Old Italic
	{ input: 'xn--097cc.com', unicode: '\u{10300}\u{10301}.com', expected: Result.Unsafe },

	// U+115F (Hangul Filler)
	{ input: 'xn--osd3820f24c.kr', unicode: '\uac00\ub098\u115f.kr', expected: Result.Invalid },
	{ input: 'www.xn--google-ho0coa.com', unicode: 'www.\u2039google\u203a.com', expected: Result.Unsafe },
	// Latin small capital w
	{ input: 'xn--hardare-l41c.com', unicode: 'hard\u1d21are.com', expected: Result.Unsafe },
	// Minus Sign (U+2212)
	{ input: 'xn--t9g238xc2a.jp', unicode: '\u65e5\u2212\u672c.jp', expected: Result.Unsafe },
	// Latin Small Letter Script G
	{ input: 'xn--0naa.com', unicode: '\u0261\u0261.com', expected: Result.Unsafe },
	// Hangul Jamo (U+11xx)
	{ input: 'xn--0pdc3b.com', unicode: '\u1102\u1103\u1110.com', expected: Result.Unsafe },
	// degree sign
	{ input: 'xn--36c-tfa.com', unicode: '36\u00b0c.com', expected: Result.Unsafe },
	// Pound sign
	{ input: 'xn--5free-fga.com', unicode: '5free\u00a3.com', expected: Result.Unsafe },
	// Hebrew points
	{ input: 'xn--7cbl2kc2a.com', unicode: '\u05e1\u05b6\u05e7\u05b0\u05e1.com', expected: Result.Unsafe },
	// Danda (U+0964)
	{
		input: 'xn--81bp1b6ch8s.com',
		unicode: '\u0924\u093f\u091c\u0964\u0930\u0940.com',
		expected: Result.Unsafe,
	},
	// Small letter script G (U+0261)
	{ input: 'xn--oogle-qmc.com', unicode: '\u0261oogle.com', expected: Result.Unsafe },
	// Small Katakana Extension (U+31F1)
	{ input: 'xn--wlk.com', unicode: '\u31f1.com', expected: Result.Unsafe },
	// Heart symbol
	{ input: 'xn--ab-u0x.com', unicode: 'ab\u2665.com', expected: Result.Unsafe },
	// Emoji
	{ input: 'xn--vi8hiv.xyz', unicode: '\u{1f355}\u{1f4a9}.xyz', expected: Result.Unsafe },
	// Registered trade mark
	{ input: 'xn--egistered-fna.com', unicode: '\u00aeegistered.com', expected: Result.Unsafe },
	// Latin Letter Retroflex Click
	{ input: 'xn--registered-25c.com', unicode: 'registered\u01c3.com', expected: Result.Unsafe },
	// ASCII '!' not allowed in IDN
	{ input: 'xn--!-257eu42c.kr', unicode: '\uc548\ub155!.kr', expected: Result.Unsafe },
	// 'GOOGLE' in IPA extension
	{
		input: 'xn--1naa7pn51hcbaa.com',
		unicode: '\u0262\u1d0f\u1d0f\u0262\u029f\u1d07.com',
		expected: Result.Unsafe,
	},
	// Padlock icon spoof
	{ input: 'xn--google-hj64e.com', unicode: '\u{1f512}google.com', expected: Result.Unsafe },

	// custom block list
	// Combining Long Solidus Overlay
	{ input: 'google.xn--comabc-k8d', unicode: 'google.com\u0338abc', expected: Result.Unsafe },
	// Hyphenation Point instead of Katakana Middle dot
	{ input: 'xn--svgy16dha.jp', unicode: '\u30a1\u2027\u30a3.jp', expected: Result.Unsafe },
	// Gershayim with other Hebrew characters is allowed
	{ input: 'xn--5db6bh9b.il', unicode: '\u05e9\u05d1\u05f4\u05e6.il', expected: Result.Safe },
	// Hebrew Gershayim with Latin — Chromium/ICU says Invalid (ContextO rules reject
	// U+05F4 between non-Hebrew characters), but we don't implement ContextO so we
	// decode it successfully and catch it as Unsafe via script mixing
	{ input: 'xn--ab-yod.com', unicode: 'a\u05f4b.com', expected: Result.Unsafe },
	// Hebrew Gershayim with Arabic is disallowed
	{ input: 'xn--5eb7h.eg', unicode: '\u0628\u05f4.eg', expected: Result.Unsafe },

	// hyphens
	{ input: 'abc-def.com', unicode: 'abc-def.com', expected: Result.Safe },
	// Modifier Letter Minus Sign
	{ input: 'xn--abcdef-5od.com', unicode: 'abc\u02d7def.com', expected: Result.Unsafe },
	// Hyphen (U+2010)
	{ input: 'xn--abcdef-dg0c.com', unicode: 'abc\u2010def.com', expected: Result.Unsafe },
	// Non-Breaking Hyphen (U+2011, normalizes to U+2010)
	{ input: 'xn--abcdef-kg0c.com', unicode: 'abc\u2011def.com', expected: Result.Invalid },
	// Figure Dash
	{ input: 'xn--abcdef-rg0c.com', unicode: 'abc\u2012def.com', expected: Result.Unsafe },
	// En Dash
	{ input: 'xn--abcdef-yg0c.com', unicode: 'abc\u2013def.com', expected: Result.Unsafe },
	// Hyphen Bullet
	{ input: 'xn--abcdef-kq0c.com', unicode: 'abc\u2043def.com', expected: Result.Unsafe },
	// Minus Sign
	{ input: 'xn--abcdef-5d3c.com', unicode: 'abc\u2212def.com', expected: Result.Unsafe },
	// Heavy Minus Sign
	{ input: 'xn--abcdef-kg1d.com', unicode: 'abc\u2796def.com', expected: Result.Unsafe },
	// Em Dash
	{ input: 'xn--abcdef-5g0c.com', unicode: 'abc\u2014def.com', expected: Result.Unsafe },
	// Coptic Small Letter Dialect-P Ni
	{ input: 'xn--abcdef-yy8d.com', unicode: 'abc\u2cbbdef.com', expected: Result.Unsafe },

	// block NV8 characters
	// U+058A (Armenian Hyphen)
	{ input: 'xn--ab-vfd.com', unicode: 'a\u058ab.com', expected: Result.Unsafe },
	{ input: 'xn--y9ac3j.com', unicode: '\u0561\u058a\u0562.com', expected: Result.Unsafe },
	// U+2019 (Right Single Quotation Mark)
	{ input: 'xn--ab-n2t.com', unicode: 'a\u2019b.com', expected: Result.Unsafe },
	// U+2027 (Hyphenation Point)
	{ input: 'xn--ab-u3t.com', unicode: 'a\u2027b.com', expected: Result.Unsafe },
	// U+30A0 (Katakana-Hiragana Double Hyphen)
	{ input: 'xn--ab-bg4a.com', unicode: 'a\u30a0b.com', expected: Result.Unsafe },
	{ input: 'xn--9bk3828aea.com', unicode: '\uac00\u30a0\uac01.com', expected: Result.Unsafe },
	{ input: 'xn--9bk279fba.com', unicode: '\u4e00\u30a0\u4e00.com', expected: Result.Unsafe },
	{ input: 'xn--n8jl2x.com', unicode: '\u304a\u30a0\u3044.com', expected: Result.Unsafe },
	{ input: 'xn--fbke7f.com', unicode: '\u3082\u30a0\u3084.com', expected: Result.Unsafe },

	// block single/double-quote-like characters
	// U+02BB (ʻ)
	{ input: 'xn--ab-8nb.com', unicode: 'a\u02bbb.com', expected: Result.Unsafe },
	// U+02BC (ʼ)
	{ input: 'xn--ab-cob.com', unicode: 'a\u02bcb.com', expected: Result.Unsafe },
	// U+144A
	{ input: 'xn--ab-jom.com', unicode: 'a\u144ab.com', expected: Result.Unsafe },
	{ input: 'xn--xcec9s.com', unicode: '\u1401\u144a\u1402.com', expected: Result.Unsafe },

	// custom dangerous patterns
	// two Katakana-Hiragana combining marks in a row
	{
		input: 'google.xn--com-oh4ba.evil.jp',
		unicode: 'google.com\u309a\u309a.evil.jp',
		expected: Result.Unsafe,
	},
	// Katakana Letter No not enclosed by CJK
	{ input: 'google.xn--comevil-v04f.jp', unicode: 'google.com\u30ceevil.jp', expected: Result.Unsafe },
	// Hiragana 'No' by itself is allowed
	{ input: 'xn--ldk.jp', unicode: '\u30ce.jp', expected: Result.Safe },
	// Hebrew Gershayim by itself is allowed
	{ input: 'xn--5eb.il', unicode: '\u05f4.il', expected: Result.Safe },

	// block RTL nonspacing marks after unrelated scripts
	{ input: 'xn--foog-ycg.com', unicode: 'foog\u0650.com', expected: Result.Unsafe },
	{ input: 'xn--foog-jdg.com', unicode: 'foog\u0654.com', expected: Result.Unsafe },
	{ input: 'xn--foog-jhg.com', unicode: 'foog\u0670.com', expected: Result.Unsafe },
	{ input: 'xn--foog-opf.com', unicode: 'foog\u05b4.com', expected: Result.Unsafe },
	{ input: 'xn--shb5495f.com', unicode: '\uac00\u0650.com', expected: Result.Unsafe },

	// math monospace small A (canonicalized to 'a')
	{ input: 'xn--bc-9x80a.xyz', unicode: '\u{1d68a}bc.xyz', expected: Result.Invalid },
	// math sans bold capital Alpha
	{ input: 'xn--bc-rg90a.xyz', unicode: '\u{1d756}bc.xyz', expected: Result.Invalid },
	// U+3000 canonicalized to space
	{ input: 'xn--p6j412gn7f.cn', unicode: '\u4e2d\u56fd\u3000', expected: Result.Invalid },
	// U+3002 canonicalized to ASCII fullstop
	{ input: 'xn--r6j012gn7f.cn', unicode: '\u4e2d\u56fd\u3002', expected: Result.Invalid },
	// invalid punycode: codepoint beyond U+10FFFF
	{ input: 'xn--krank-kg706554a', unicode: '', expected: Result.Invalid },
	// '?' in punycode
	{ input: 'xn--hello?world.com', unicode: '', expected: Result.Invalid },

	// not allowed in UTS46/IDNA 2008
	// Georgian Capital Letter
	{ input: 'xn--1nd.com', unicode: '\u10bd.com', expected: Result.Invalid },
	// 3rd and 4th characters are '-'
	{ input: 'xn-----8kci4dhsd', unicode: '\u0440\u0443--\u0430\u0432\u0442\u043e', expected: Result.Invalid },
	// leading combining mark
	{ input: 'xn--72b.com', unicode: '\u093e.com', expected: Result.Invalid },
	// BiDi: cannot start with Arabic-Indic Number
	{ input: 'xn--8hbae.eg', unicode: '\u0662\u0660\u0660.eg', expected: Result.Invalid },
	// BiDi: cannot start with RTL and end with LTR
	{ input: 'xn--x-ymcov.eg', unicode: '\u062c\u0627\u0631x.eg', expected: Result.Invalid },
	// can start with RTL and end with EN
	{ input: 'xn--2-ymcov.eg', unicode: '\u062c\u0627\u06312.eg', expected: Result.Safe },
	// can start with RTL and end with AN
	{ input: 'xn--mgbjq0r.eg', unicode: '\u062c\u0627\u0631\u0662.eg', expected: Result.Safe },

	// extremely rare Latin letters
	// Latin Ext B - Pinyin
	{ input: 'xn--nion-unb.com', unicode: '\u01d4nion.com', expected: Result.Unsafe },
	// Latin Ext C
	{ input: 'xn--ase-7z0b.com', unicode: '\u2c74ase.com', expected: Result.Unsafe },
	// Latin Ext D
	{ input: 'xn--ode-ut3l.com', unicode: '\ua774ode.com', expected: Result.Unsafe },
	// Latin Ext Additional
	{ input: 'xn--ily-n3y.com', unicode: '\u1e37ily.com', expected: Result.Unsafe },
	// Latin Ext E
	{ input: 'xn--ove-8y6l.com', unicode: '\uab3aove.com', expected: Result.Unsafe },
	// Greek Ext
	{ input: 'xn--nxac616s.com', unicode: '\u1fb3\u03b2\u03b3.com', expected: Result.Invalid },
	// Cyrillic Ext A
	{ input: 'xn--lrj.com', unicode: '\u2def.com', expected: Result.Invalid },
	// Cyrillic Ext B
	{ input: 'xn--kx8a.com', unicode: '\ua661.com', expected: Result.Unsafe },
	// Cyrillic Ext C (Narrow o)
	{ input: 'xn--43f.com', unicode: '\u1c82.com', expected: Result.Invalid },

	// Extended Arabic-Indic Digit Zero skeleton is a dot
	{ input: 'xn--dmb', unicode: '\u06f0', expected: Result.Safe },

	{ input: 'xn--st-9ia.net', unicode: '\u00e9st.net', expected: Result.Safe },
	{ input: 'some.xn--st-9ia.net', unicode: 'some.\u00e9st.net', expected: Result.Safe },
	{ input: 'xn--atst-cpa.net', unicode: 'at\u00e9st.net', expected: Result.Safe },
	{ input: 'some.xn--atst-cpa.net', unicode: 'some.at\u00e9st.net', expected: Result.Safe },

	// modifier-letter-voicing
	{ input: 'xn--wwwtest-2be.com', unicode: 'www\u02ectest.com', expected: Result.Unsafe },

	// oĸ.com — blocked because of Kra
	{ input: 'xn--o-tka.com', unicode: 'o\u0138.com', expected: Result.Unsafe },

	// U+4E00 and U+3127 blocked next to non-CJK
	{ input: 'xn--ipaddress-w75n.com', unicode: 'ip\u4e00address.com', expected: Result.Unsafe },
	{ input: 'xn--ipaddress-wx5h.com', unicode: 'ip\u3127address.com', expected: Result.Unsafe },
	{ input: 'xn--google-gg5e.com', unicode: 'google\u3127.com', expected: Result.Unsafe },
	{ input: 'xn--google-9f5e.com', unicode: '\u3127google.com', expected: Result.Unsafe },
	{ input: 'xn--google-gn7i.com', unicode: 'google\u4e00.com', expected: Result.Unsafe },
	{ input: 'xn--google-9m7i.com', unicode: '\u4e00google.com', expected: Result.Unsafe },
	// allowed because U+4E00 and U+3127 are not immediately next to non-CJK
	{ input: 'xn--gamer-fg1hz05u.com', unicode: '\u4e00\u751fgamer.com', expected: Result.Safe },
	{ input: 'xn--gamer-kg1hy05u.com', unicode: 'gamer\u751f\u4e00.com', expected: Result.Safe },
	{ input: 'xn--gamer-f94d4426b.com', unicode: '\u3127\u751fgamer.com', expected: Result.Safe },
	{ input: 'xn--gamer-k94d3426b.com', unicode: 'gamer\u751f\u3127.com', expected: Result.Safe },
	{ input: 'xn--4gqz91g.com', unicode: '\u4e00\u732b.com', expected: Result.Safe },
	{ input: 'xn--4fkv10r.com', unicode: '\u3127\u732b.com', expected: Result.Safe },
	// U+4E00 with another ideograph
	{ input: 'xn--4gqc.com', unicode: '\u4e00\u4e01.com', expected: Result.Safe },

	// CJK ideographs looking like slashes blocked next to non-CJK
	{ input: 'example.xn--comtest-k63k', unicode: 'example.com\u4e36test', expected: Result.Unsafe },
	{ input: 'example.xn--comtest-u83k', unicode: 'example.com\u4e40test', expected: Result.Unsafe },
	{ input: 'example.xn--comtest-283k', unicode: 'example.com\u4e41test', expected: Result.Unsafe },
	{ input: 'example.xn--comtest-m83k', unicode: 'example.com\u4e3ftest', expected: Result.Unsafe },
	// allowed because ideographs are not immediately next to non-CJK
	{ input: 'xn--oiqsace.com', unicode: '\u4e36\u4e40\u4e41\u4e3f.com', expected: Result.Safe },

	// Kana voiced sound marks not allowed
	{ input: 'xn--google-1m4e.com', unicode: 'google\u3099.com', expected: Result.Unsafe },
	{ input: 'xn--google-8m4e.com', unicode: 'google\u309A.com', expected: Result.Unsafe },

	// small letter theta looks like zero
	{ input: 'xn--123456789-yzg.com', unicode: '123456789\u03b8.com', expected: Result.Unsafe },

	// CJK ideographs that look like numbers/letters next to Latin
	{ input: 'xn--est-118d.net', unicode: '\u4e03est.net', expected: Result.Unsafe },
	{ input: 'xn--est-918d.net', unicode: '\u4e05est.net', expected: Result.Unsafe },
	{ input: 'xn--est-e28d.net', unicode: '\u4e06est.net', expected: Result.Unsafe },
	{ input: 'xn--est-t18d.net', unicode: '\u4e01est.net', expected: Result.Unsafe },
	{ input: 'xn--3-cq6a.com', unicode: '\u4e293.com', expected: Result.Unsafe },
	{ input: 'xn--cxe-n68d.com', unicode: 'c\u4e2bxe.com', expected: Result.Unsafe },
	{ input: 'xn--cye-b98d.com', unicode: 'cy\u4e42e.com', expected: Result.Unsafe },

	// U+05D7 looks like Latin n
	{ input: 'xn--ceba.com', unicode: '\u05d7\u05d7.com', expected: Result.Unsafe },

	// U+00FE (þ) and U+00F0 (ð) only allowed under .is and .fo
	{ input: 'xn--acdef-wva.com', unicode: 'a\u00fecdef.com', expected: Result.Unsafe },
	{ input: 'xn--mnpqr-jta.com', unicode: 'mn\u00f0pqr.com', expected: Result.Unsafe },
	{ input: 'xn--acdef-wva.is', unicode: 'a\u00fecdef.is', expected: Result.Safe },
	{ input: 'xn--mnpqr-jta.is', unicode: 'mn\u00f0pqr.is', expected: Result.Safe },
	{ input: 'xn--mnpqr-jta.fo', unicode: 'mn\u00f0pqr.fo', expected: Result.Safe },

	// U+0259 (ə) only allowed under .az
	{ input: 'xn--xample-vyc.com', unicode: '\u0259xample.com', expected: Result.Unsafe },
	{ input: 'xn--xample-vyc.az', unicode: '\u0259xample.az', expected: Result.Safe },

	// U+00B7 only allowed on Catalan domains between two l's
	{ input: 'xn--googlecom-5pa.com', unicode: 'google\u00b7com.com', expected: Result.Unsafe },
	{ input: 'xn--ll-0ea.com', unicode: 'l\u00b7l.com', expected: Result.Unsafe },
	{ input: 'xn--ll-0ea.cat', unicode: 'l\u00b7l.cat', expected: Result.Safe },
	{ input: 'xn--al-0ea.cat', unicode: 'a\u00b7l.cat', expected: Result.Unsafe },
	{ input: 'xn--la-0ea.cat', unicode: 'l\u00b7a.cat', expected: Result.Unsafe },
	{ input: 'xn--l-fda.cat', unicode: '\u00b7l.cat', expected: Result.Unsafe },
	{ input: 'xn--l-gda.cat', unicode: 'l\u00b7.cat', expected: Result.Unsafe },

	// CJK ideographs and Kangxi radicals next to Latin
	{ input: 'xn--googlecom-gk6n.com', unicode: 'google\u4e28com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-0y6n.com', unicode: 'google\u4e5bcom.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-v85n.com', unicode: 'google\u4e03com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-g95n.com', unicode: 'google\u4e05com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-go6n.com', unicode: 'google\u4e36com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-b76o.com', unicode: 'google\u5341com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-ql3h.com', unicode: 'google\u3007com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-0r5h.com', unicode: 'google\u3112com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-bu5h.com', unicode: 'google\u311acom.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-qv5h.com', unicode: 'google\u311fcom.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-0x5h.com', unicode: 'google\u3127com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-by5h.com', unicode: 'google\u3128com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-ly5h.com', unicode: 'google\u3129com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-5o5h.com', unicode: 'google\u3108com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-075n.com', unicode: 'google\u4e00com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-046h.com', unicode: 'google\u31bacom.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-026h.com', unicode: 'google\u31b3com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-lg9q.com', unicode: 'google\u5de5com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-g040a.com', unicode: 'google\u8ba0com.com', expected: Result.Unsafe },
	{ input: 'xn--googlecom-b85n.com', unicode: 'google\u4e01com.com', expected: Result.Unsafe },

	// CJK ideographs at beginning/end next to Latin
	{ input: 'xn--google-2x7i.com', unicode: '\u4e36google.com', expected: Result.Unsafe },
	{ input: 'xn--google-8x7i.com', unicode: 'google\u4e36.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-1m1u.com', unicode: 'google\u4e36example.com', expected: Result.Unsafe },
	{ input: 'xn--google-ve8i.com', unicode: '\u4e85google.com', expected: Result.Unsafe },
	{ input: 'xn--google-1e8i.com', unicode: 'google\u4e85.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-nj2u.com', unicode: 'google\u4e85example.com', expected: Result.Unsafe },
	{ input: 'xn--google-9f8i.com', unicode: '\u4e8cgoogle.com', expected: Result.Unsafe },
	{ input: 'xn--google-gg8i.com', unicode: 'google\u4e8c.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-gm2u.com', unicode: 'google\u4e8cexample.com', expected: Result.Unsafe },
	{ input: 'xn--google-9j8i.com', unicode: '\u4ea0google.com', expected: Result.Unsafe },
	{ input: 'xn--google-gk8i.com', unicode: 'google\u4ea0.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-gu2u.com', unicode: 'google\u4ea0example.com', expected: Result.Unsafe },
	{ input: 'xn--google-vv2j.com', unicode: '\u5196google.com', expected: Result.Unsafe },
	{ input: 'xn--google-1v2j.com', unicode: 'google\u5196.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-ni1v.com', unicode: 'google\u5196example.com', expected: Result.Unsafe },
	{ input: 'xn--google-he7k.com', unicode: '\u5b80google.com', expected: Result.Unsafe },
	{ input: 'xn--google-ne7k.com', unicode: 'google\u5b80.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-ui0y.com', unicode: 'google\u5b80example.com', expected: Result.Unsafe },
	{ input: 'xn--google-2t0l.com', unicode: '\u5ddbgoogle.com', expected: Result.Unsafe },
	{ input: 'xn--google-8t0l.com', unicode: 'google\u5ddb.com', expected: Result.Unsafe },
	{ input: 'xn--googleexample-1e7y.com', unicode: 'google\u5ddbexample.com', expected: Result.Unsafe },

	// whole-script confusables (non-Cyrillic)
	// Armenian
	{ input: 'xn--mbbkpm.com', unicode: '\u0578\u057d\u0582\u0585.com', expected: Result.Unsafe },
	{ input: 'xn--mbbkpm.am', unicode: '\u0578\u057d\u0582\u0585.am', expected: Result.Safe },
	{
		input: 'xn--mbbkpm.xn--y9a3aq',
		unicode: '\u0578\u057d\u0582\u0585.\u0570\u0561\u0575',
		expected: Result.Safe,
	},
	// Ethiopic
	{ input: 'xn--6xd66aa62c.com', unicode: '\u1220\u12d0\u12d0\u1350.com', expected: Result.Unsafe },
	{ input: 'xn--6xd66aa62c.et', unicode: '\u1220\u12d0\u12d0\u1350.et', expected: Result.Safe },
	{
		input: 'xn--6xd66aa62c.xn--m0d3gwjla96a',
		unicode: '\u1220\u12d0\u12d0\u1350.\u12a2\u1275\u12ee\u1335\u12eb',
		expected: Result.Safe,
	},
	// Greek
	{ input: 'xn--mxapd.com', unicode: '\u03b9\u03ba\u03b1.com', expected: Result.Unsafe },
	{ input: 'xn--mxapd.gr', unicode: '\u03b9\u03ba\u03b1.gr', expected: Result.Safe },
	{ input: 'xn--mxapd.xn--qxam', unicode: '\u03b9\u03ba\u03b1.\u03b5\u03bb', expected: Result.Safe },
	// Georgian
	{ input: 'xn--gpd3ag.com', unicode: '\u10fd\u10ff\u10ee.com', expected: Result.Unsafe },
	{ input: 'xn--gpd3ag.ge', unicode: '\u10fd\u10ff\u10ee.ge', expected: Result.Safe },
	{ input: 'xn--gpd3ag.xn--node', unicode: '\u10fd\u10ff\u10ee.\u10d2\u10d4', expected: Result.Safe },
	// Hebrew
	{ input: 'xn--7dbh4a.com', unicode: '\u05d7\u05e1\u05d3.com', expected: Result.Unsafe },
	{ input: 'xn--7dbh4a.il', unicode: '\u05d7\u05e1\u05d3.il', expected: Result.Safe },
	{ input: 'xn--9dbq2a.xn--7dbh4a', unicode: '\u05e7\u05d5\u05dd.\u05d7\u05e1\u05d3', expected: Result.Safe },
	// Myanmar
	{ input: 'xn--oidbbf41a.com', unicode: '\u1004\u1040\u1002\u1001\u1002.com', expected: Result.Unsafe },
	{ input: 'xn--oidbbf41a.mm', unicode: '\u1004\u1040\u1002\u1001\u1002.mm', expected: Result.Safe },
	{
		input: 'xn--oidbbf41a.xn--7idjb0f4ck',
		unicode: '\u1004\u1040\u1002\u1001\u1002.\u1019\u103c\u1014\u103a\u1019\u102c',
		expected: Result.Safe,
	},
	// Myanmar Shan digits
	{ input: 'xn--rmdcmef.com', unicode: '\u1090\u1091\u1095\u1096\u1097.com', expected: Result.Unsafe },
	{ input: 'xn--rmdcmef.mm', unicode: '\u1090\u1091\u1095\u1096\u1097.mm', expected: Result.Safe },
	{
		input: 'xn--rmdcmef.xn--7idjb0f4ck',
		unicode: '\u1090\u1091\u1095\u1096\u1097.\u1019\u103c\u1014\u103a\u1019\u102c',
		expected: Result.Safe,
	},
	// Thai (platform-dependent in Chromium, using the non-Linux variant here)
	{ input: 'xn--r3ch7hsc.com', unicode: '\u0e1e\u0e1a\u0e40\u0e50.com', expected: Result.Unsafe },
	{ input: 'xn--r3ch7hsc.th', unicode: '\u0e1e\u0e1a\u0e40\u0e50.th', expected: Result.Safe },
	{
		input: 'xn--r3ch7hsc.xn--o3cw4h',
		unicode: '\u0e1e\u0e1a\u0e40\u0e50.\u0e44\u0e17\u0e22',
		expected: Result.Safe,
	},

	// Indic whole-script confusables
	// Bengali
	{ input: 'xn--07baub.com', unicode: '\u09e6\u09ed\u09e6\u09ed.com', expected: Result.Unsafe },
	// Devanagari
	{ input: 'xn--62ba6j.com', unicode: '\u093d\u0966\u093d.com', expected: Result.Unsafe },
	// Gujarati
	{ input: 'xn--becd.com', unicode: '\u0aa1\u0a9f.com', expected: Result.Unsafe },
	// Gurmukhi
	{ input: 'xn--occacb.com', unicode: '\u0a66\u0a67\u0a66\u0a67.com', expected: Result.Unsafe },
	// Kannada
	{ input: 'xn--stca6jf.com', unicode: '\u0cbd\u0ce6\u0cbd\u0ce7.com', expected: Result.Unsafe },
	// Malayalam
	{ input: 'xn--lwccv.com', unicode: '\u0d1f\u0d20\u0d27.com', expected: Result.Unsafe },
	// Oriya
	{ input: 'xn--zhca6ub.com', unicode: '\u0b6e\u0b20\u0b6e\u0b20.com', expected: Result.Unsafe },
	// Tamil
	{ input: 'xn--mlca6ab.com', unicode: '\u0b9f\u0baa\u0b9f\u0baa.com', expected: Result.Unsafe },
	// Telugu
	{ input: 'xn--brcaabbb.com', unicode: '\u0c67\u0c66\u0c67\u0c66\u0c67\u0c66.com', expected: Result.Unsafe },

	// digit lookalike with Georgian character
	{ input: 'xn--16-1ik.com', unicode: '16\u10d9.com', expected: Result.Unsafe },
	// Georgian digit lookalike mixed with ASCII digits
	{ input: 'xn--office65-l04a.com', unicode: 'office\u10d965.com', expected: Result.Unsafe },
	// digit lookalike with Gurmukhi character
	{ input: 'xn--16-ogg.com', unicode: '16\u0a5c.com', expected: Result.Unsafe },
	// Gurmukhi digit lookalike mixed with ASCII digits
	{ input: 'xn--office65-hts.com', unicode: 'office\u0a5c65.com', expected: Result.Unsafe },

	// ı (dotless i) is blocklisted
	{ input: 'xn--googe-q4a.com', unicode: 'goog\u0131e.com', expected: Result.Unsafe },
];

const kDeviationCases: IdnTestCase[] = [
	// U+00DF (sharp-s)
	{ input: 'xn--fu-hia.de', unicode: 'fu\u00df.de', expected: Result.Safe },
	// U+03C2 (final-sigma)
	{ input: 'xn--mxac2c.gr', unicode: '\u03b1\u03b2\u03c2.gr', expected: Result.Safe },
	// U+200C (ZWNJ) — explicitly unsafe
	{ input: 'xn--h2by8byc123p.in', unicode: '\u0924\u094d\u200c\u0930\u093f.in', expected: Result.Unsafe },
	// U+200D (ZWJ) — explicitly unsafe
	{ input: 'xn--11b6iy14e.in', unicode: '\u0915\u094d\u200d.in', expected: Result.Unsafe },
	// youtuße.com — always unsafe
];
// #endregion

describe('IDN safety (Chromium test cases)', () => {
	for (const tc of kIdnCases) {
		const label = tc.unicode || tc.input;
		test(`${label} → ${ResultName[tc.expected]}`, () => {
			const actual = checkResult(tc.input, tc.unicode);
			assert.equal(
				actual,
				tc.expected,
				`expected ${ResultName[tc.expected]} but got ${ResultName[actual]} for ${tc.input} (${tc.unicode})`,
			);
		});
	}
});

describe('IDN deviation characters', () => {
	for (const tc of kDeviationCases) {
		const label = tc.unicode || tc.input;
		test(`${label} → ${ResultName[tc.expected]}`, () => {
			const actual = checkResult(tc.input, tc.unicode);
			assert.equal(
				actual,
				tc.expected,
				`expected ${ResultName[tc.expected]} but got ${ResultName[actual]} for ${tc.input} (${tc.unicode})`,
			);
		});
	}
});

// note: top-domain skeleton matching was intentionally removed in favor of a
// pure algorithmic (Firefox-style) approach, so the Chromium top-domain cases
// that relied on it are dropped below rather than ported.
