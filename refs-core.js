// Issue and PR references in assistant text, turned into markdown links.
// Pure: no imports, so any JavaScript engine can test it.

/** Spans that must never be rewritten: fences, existing links, bare URLs. Inline code is masked separately. */
const PROTECTED = [
	/```[\s\S]*?```/g,
	/~~~[\s\S]*?~~~/g,
	/!?\[[^\]\n]*\]\([^)\n]*\)/g,
	/<https?:\/\/[^>\s]+>/g,
	/https?:\/\/[^\s<>()\[\]]+/g,
];

const INLINE_CODE = /`[^`\n]*`/g;

function maskOf(text, withInlineCode) {
	const blocked = new Uint8Array(text.length);
	for (const pattern of withInlineCode ? [...PROTECTED, INLINE_CODE] : PROTECTED) {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			const end = match.index + match[0].length;
			for (let i = match.index; i < end; i += 1) blocked[i] = 1;
			if (match[0].length === 0) pattern.lastIndex += 1;
		}
	}
	markStretches(text, blocked);
	return blocked;
}

/**
 * Stretchtext (`{{short|long}}`, nestable, possibly still streaming and unclosed) is itself drawn as a
 * link, and a link cannot hold another: a reference inside would draw as raw brackets and a URL.
 * The whole span stays plain. `{{` and `}}` inside code are not stretch markup.
 */
function markStretches(text, blocked) {
	const code = new Uint8Array(text.length);
	for (const pattern of [PROTECTED[0], PROTECTED[1], INLINE_CODE]) {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			code.fill(1, match.index, match.index + match[0].length);
			if (match[0].length === 0) pattern.lastIndex += 1;
		}
	}
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length - 1; i += 1) {
		if (code[i] === 1) continue;
		if (text[i] === "{" && text[i + 1] === "{") {
			if (depth === 0) start = i;
			depth += 1;
			i += 1;
		} else if (text[i] === "}" && text[i + 1] === "}" && depth > 0) {
			depth -= 1;
			i += 1;
			if (depth === 0) blocked.fill(1, start, i + 1);
		}
	}
	if (depth > 0) blocked.fill(1, start, text.length);
}

const OWNER_REPO_REF = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9._-]+)#([1-9]\d{0,5})(?!\d)/;
const BARE_REF = /^#([1-9]\d{1,5})(?!\d)/;
const TICKET = /^([A-Z][A-Z0-9]{1,5})-([1-9]\d{0,5})(?!\d)/;
const WORDISH = /[A-Za-z0-9_&#/[]/;
const HEX_RUN = "[0-9a-f]{7,40}";
const HEX = `${HEX_RUN}(?![0-9A-Za-z_-]|\\.[0-9A-Za-z])`;
const BARE_SHA = new RegExp(`^${HEX}`);
const REPO_SHA = new RegExp(`^([A-Za-z0-9][A-Za-z0-9._-]*)/([A-Za-z0-9._-]+)@(${HEX})`);
const CODE_SHA = new RegExp(`^\`(?:([A-Za-z0-9][A-Za-z0-9._-]*)/([A-Za-z0-9._-]+)@)?(${HEX_RUN})\``);
const SHA_BEFORE = /[A-Za-z0-9_/.#@-]/;
const isSha = text => /\d/.test(text) && /[a-f]/.test(text);

export const DEFAULT_ICONS = { github: "\u2387", linear: "\u2691", commit: "\u25cf" };

/** The icon per kind: defaults, overridden by `options.icons`. An empty string drops the icon; backticks cannot sit in a code span. */
export function iconsOf(options) {
	const given = (options && options.icons) || {};
	const icons = {};
	for (const kind of Object.keys(DEFAULT_ICONS)) {
		icons[kind] = typeof given[kind] === "string" ? given[kind].replace(/[`\r\n]/g, "").trim() : DEFAULT_ICONS[kind];
	}
	return icons;
}

/** The fragment on every link this file writes; the Tern plugin's CSS keys on it. GitHub and Linear ignore it. */
export const MARKER = "omp-refs";

/** A link whose text is a code span, so it draws as a tag: `[`icon label`](url#omp-refs)`. */
const chip = (icon, label, url) => `[\`${icon === "" ? "" : `${icon} `}${label}\`](${url}#${MARKER})`;

const MD_LINK = /\[([^\]\n`]+)\]\((https:\/\/[^)\s#?]+)\)/g;
const LINEAR_URL = /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Z][A-Z0-9]{1,5}-[1-9]\d{0,5})(?:\/[^/]*)?$/;
const ISSUE_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/([1-9]\d{0,5})$/;
const COMMIT_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\/([0-9a-f]{7,40})$/;
const ISSUE_TEXT = /^(?:(?:PR|issue)\s+)?(?:[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+)?#([1-9]\d{0,5})$/i;

/**
 * A link the model wrote itself, `[SW-3152](https://linear.app/…/issue/SW-3152)`, is drawn with its URL
 * printed after it outside Tern, and as a plain link in Tern. When its text is exactly the reference
 * its URL names (a Linear key, `#12` or `PR #12` for an issue or PR URL, a SHA for a commit URL), it
 * becomes a chip like the references omp-refs finds itself. Descriptive link text is left alone.
 * Returns undefined when nothing changed.
 */
function adoptLinks(text, icons) {
	if (!text.includes("](https://")) return undefined;
	const skip = new Uint8Array(text.length);
	for (const pattern of [PROTECTED[0], PROTECTED[1], INLINE_CODE]) {
		pattern.lastIndex = 0;
		let found;
		while ((found = pattern.exec(text)) !== null) {
			skip.fill(1, found.index, found.index + found[0].length);
			if (found[0].length === 0) pattern.lastIndex += 1;
		}
	}
	markStretches(text, skip);
	let out = "";
	let last = 0;
	MD_LINK.lastIndex = 0;
	let match;
	while ((match = MD_LINK.exec(text)) !== null) {
		const [whole, label, url] = match;
		if (skip[match.index] === 1 || (match.index > 0 && text[match.index - 1] === "!")) continue;
		let icon;
		let reference = LINEAR_URL.exec(url);
		if (reference !== null && label === reference[1]) icon = icons.linear;
		else if ((reference = ISSUE_URL.exec(url)) !== null && (ISSUE_TEXT.exec(label) || [])[1] === reference[1]) icon = icons.github;
		else if ((reference = COMMIT_URL.exec(url)) !== null && /^[0-9a-f]{7,40}$/.test(label) && isSha(label) && reference[1].startsWith(label)) icon = icons.commit;
		if (icon === undefined) continue;
		out += text.slice(last, match.index) + chip(icon, label, url);
		last = match.index + whole.length;
	}
	return last === 0 ? undefined : out + text.slice(last);
}

/**
 * Rewrites `owner/repo#12`, `#12`, `ABC-12` and commit SHAs into markdown links.
 * `#12` and a bare SHA need a GitHub repo (owner/repo); `ABC-12` needs its key in `teams`.
 * A SHA is 7-40 lowercase hex characters holding a digit and a letter, so words and numbers stay plain.
 * Returns undefined when there is nothing to rewrite.
 */
export function linkify(text, options) {
	if (typeof text !== "string" || text.length === 0) return undefined;
	const repo = options && options.repo;
	const workspace = (options && options.workspace) || "linear.app";
	const teams = new Set(((options && options.teams) || []).map(key => String(key).toUpperCase()));
	const icons = iconsOf(options);
	const adopted = adoptLinks(text, icons);
	if (adopted !== undefined) text = adopted;
	const blocked = maskOf(text, true);
	const outer = maskOf(text, false);
	const free = (start, length, mask = blocked) => {
		for (let i = start; i < start + length; i += 1) if (mask[i] === 1) return false;
		return true;
	};
	let out = "";
	let index = 0;
	let changed = adopted !== undefined;
	while (index < text.length) {
		const rest = text.slice(index);
		const before = index > 0 ? text[index - 1] : "";
		let match = OWNER_REPO_REF.exec(rest);
		if (match !== null && free(index, match[0].length) && !WORDISH.test(before)) {
			out += chip(icons.github, match[0], `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`);
			index += match[0].length;
			changed = true;
			continue;
		}
		match = BARE_REF.exec(rest);
		if (match !== null && repo !== undefined && free(index, match[0].length) && !WORDISH.test(before)) {
			out += chip(icons.github, match[0], `https://github.com/${repo}/issues/${match[1]}`);
			index += match[0].length;
			changed = true;
			continue;
		}
		match = TICKET.exec(rest);
		if (match !== null && teams.has(match[1]) && free(index, match[0].length) && !/[A-Za-z0-9_-]/.test(before)) {
			out += chip(icons.linear, match[0], `https://linear.app/${workspace}/issue/${match[0]}`);
			index += match[0].length;
			changed = true;
			continue;
		}
		match = REPO_SHA.exec(rest);
		if (match !== null && isSha(match[3]) && free(index, match[0].length) && !SHA_BEFORE.test(before)) {
			out += chip(icons.commit, match[0], `https://github.com/${match[1]}/${match[2]}/commit/${match[3]}`);
			index += match[0].length;
			changed = true;
			continue;
		}
		match = BARE_SHA.exec(rest);
		if (match !== null && repo !== undefined && isSha(match[0]) && free(index, match[0].length) && !SHA_BEFORE.test(before)) {
			out += chip(icons.commit, match[0], `https://github.com/${repo}/commit/${match[0]}`);
			index += match[0].length;
			changed = true;
			continue;
		}
		// A code span that is exactly one SHA keeps its code style inside the link.
		match = CODE_SHA.exec(rest);
		if (match !== null && free(index, match[0].length, outer)) {
			const target = match[1] === undefined ? (repo !== undefined && isSha(match[3]) ? repo : undefined) : isSha(match[3]) ? `${match[1]}/${match[2]}` : undefined;
			if (target !== undefined) {
				out += chip(icons.commit, match[0].slice(1, -1), `https://github.com/${target}/commit/${match[3]}`);
				index += match[0].length;
				changed = true;
				continue;
			}
		}
		out += text[index];
		index += 1;
	}
	return changed ? out : undefined;
}
