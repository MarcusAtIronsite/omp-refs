// Issue and PR references in assistant text, turned into markdown links.
// Pure: no imports, so any JavaScript engine can test it.

/** Spans that must never be rewritten: code, existing links, bare URLs. */
const PROTECTED = [
	/```[\s\S]*?```/g,
	/~~~[\s\S]*?~~~/g,
	/`[^`\n]*`/g,
	/!?\[[^\]\n]*\]\([^)\n]*\)/g,
	/<https?:\/\/[^>\s]+>/g,
	/https?:\/\/[^\s<>()\[\]]+/g,
];

function maskOf(text) {
	const blocked = new Uint8Array(text.length);
	for (const pattern of PROTECTED) {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(text)) !== null) {
			const end = match.index + match[0].length;
			for (let i = match.index; i < end; i += 1) blocked[i] = 1;
			if (match[0].length === 0) pattern.lastIndex += 1;
		}
	}
	return blocked;
}

const OWNER_REPO_REF = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9._-]+)#([1-9]\d{0,5})(?!\d)/;
const BARE_REF = /^#([1-9]\d{1,5})(?!\d)/;
const TICKET = /^([A-Z][A-Z0-9]{1,5})-([1-9]\d{0,5})(?!\d)/;
const WORDISH = /[A-Za-z0-9_&#/[]/;

/**
 * Rewrites `owner/repo#12`, `#12` and `ABC-12` into markdown links.
 * `#12` needs a GitHub repo (owner/repo); `ABC-12` needs its key in `teams`.
 * Returns undefined when there is nothing to rewrite.
 */
export function linkify(text, options) {
	if (typeof text !== "string" || text.length === 0) return undefined;
	const repo = options && options.repo;
	const workspace = (options && options.workspace) || "linear.app";
	const teams = new Set(((options && options.teams) || []).map(key => String(key).toUpperCase()));
	const blocked = maskOf(text);
	const free = (start, length) => {
		for (let i = start; i < start + length; i += 1) if (blocked[i] === 1) return false;
		return true;
	};
	let out = "";
	let index = 0;
	let changed = false;
	while (index < text.length) {
		const rest = text.slice(index);
		const before = index > 0 ? text[index - 1] : "";
		let match = OWNER_REPO_REF.exec(rest);
		if (match !== null && free(index, match[0].length) && !WORDISH.test(before)) {
			out += `[${match[0]}](https://github.com/${match[1]}/${match[2]}/issues/${match[3]})`;
			index += match[0].length;
			changed = true;
			continue;
		}
		match = BARE_REF.exec(rest);
		if (match !== null && repo !== undefined && free(index, match[0].length) && !WORDISH.test(before)) {
			out += `[#${match[1]}](https://github.com/${repo}/issues/${match[1]})`;
			index += match[0].length;
			changed = true;
			continue;
		}
		match = TICKET.exec(rest);
		if (match !== null && teams.has(match[1]) && free(index, match[0].length) && !/[A-Za-z0-9_-]/.test(before)) {
			out += `[${match[0]}](https://linear.app/${workspace}/issue/${match[0]})`;
			index += match[0].length;
			changed = true;
			continue;
		}
		out += text[index];
		index += 1;
	}
	return changed ? out : undefined;
}
