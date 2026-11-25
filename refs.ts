// Clickable GitHub pull-request and Linear ticket references in omp replies.
//
// The reply's stored text is left untouched: only what the transcript draws is rewritten, turning
// `#4705`, `owner/repo#7` and `ABC-146` into markdown links to the PR/issue. Code spans, fenced
// blocks, existing links and bare URLs are left alone.
//
// Tern draws omp's own message components, so the component's updateContent is wrapped (the way
// omp-stretch does); a plain terminal draws through omp's assistant text renderer instead, which is
// registered when that module is unavailable.
//
// Settings live in ~/.omp/agent/refs.json, one object per provider under `providers`:
//   { "providers": {
//       "github": { "repoOverride": "owner/repo", "icon": "⎇", "color": "#a371f7",
//                   "commits": { "icon": "●", "color": "#8b949e" } },
//       "linear": { "workspace": "acme", "teams": ["ABC", "OPS"], "icon": "⚑", "color": "#5e6ad2" } } }
// Every provider takes `enabled`, `icon` and `color`; `repoOverride` is GitHub's, `workspace` and
// `teams` Linear's. Bare `#123` uses the `origin` remote of the session's directory (the nearest
// repository above it) unless `repoOverride` names a repository. Without a Linear
// workspace and team list, ticket references stay plain; without a GitHub repo, bare `#123` stays plain.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MARKER, iconsOf, linkify } from "./refs-core.js";

/** What every provider (and the commits under GitHub) takes; `color` is read by the Tern plugin. */
type Common = { enabled?: boolean; icon?: string; color?: string };

type Config = {
	providers?: {
		github?: Common & { repoOverride?: string; commits?: Common };
		linear?: Common & { workspace?: string; teams?: string[] };
	};
};

type TextBlock = { type: string; text?: string };
type Message = { content?: unknown };
type Options = {
	repo: string | undefined;
	workspace: string;
	teams: string[];
	icons: { github?: string; linear?: string; commit?: string };
	off: { github: boolean; linear: boolean; commit: boolean };
};

const CONFIG_PATH = join(homedir(), ".omp", "agent", "refs.json");
const DEBUG = process.env.OMP_REFS_DEBUG !== undefined ? "/tmp/omp-refs-debug.log" : undefined;

function note(line: string): void {
	if (DEBUG !== undefined) appendFileSync(DEBUG, `${line}\n`);
}

/** The config file, re-read at every session start; defaults stand when it is absent or broken. */
function readConfig(): Config {
	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
		return parsed !== null && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * Tern's omp-refs plugin draws the icons in CSS, so the text ones would double them. A linked plugin
 * is `plugins/omp-refs.path` in Tern's config folder, an installed copy `plugins/omp-refs/`.
 * shortcut: the default folder is macOS's; elsewhere TERN_CONFIG_DIR must be set, else text icons stay.
 */
function ternDrawsIcons(): boolean {
	if (process.env.TERM_PROGRAM !== "tern") return false;
	const base = process.env.TERN_CONFIG_DIR ?? join(homedir(), "Library", "Application Support", "Tern");
	return existsSync(join(base, "plugins", "omp-refs")) || existsSync(join(base, "plugins", "omp-refs.path"));
}

const repos = new Map<string, string | undefined>();
let config: Config = readConfig();
let cwd = process.cwd();
let cached: Options | undefined;

/** `owner/repo` for a directory's origin remote (git searches the parent folders), or the configured override. */
function repoOf(directory: string): string | undefined {
	const configured = config.providers?.github?.repoOverride;
	if (typeof configured === "string" && configured !== "") return configured;
	if (repos.has(directory)) return repos.get(directory);
	let repo: string | undefined;
	try {
		const remote = execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: directory,
			encoding: "utf8",
			timeout: 2000,
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(remote);
		if (match !== null) repo = `${match[1]}/${match[2]}`;
	} catch {
		repo = undefined;
	}
	repos.set(directory, repo);
	return repo;
}

function options(): Options {
	if (cached === undefined) {
		const github = config.providers?.github;
		const linear = config.providers?.linear;
		const commits = github?.commits;
		const teams = linear?.teams;
		cached = {
			repo: repoOf(cwd),
			workspace: typeof linear?.workspace === "string" ? linear.workspace : "",
			teams: Array.isArray(teams) ? teams.filter((key): key is string => typeof key === "string") : [],
			icons: ternDrawsIcons()
				? { github: "", linear: "", commit: "" }
				: { github: github?.icon, linear: linear?.icon, commit: commits?.icon },
			// Commits belong to GitHub: switching GitHub off switches them off too.
			off: {
				github: github?.enabled === false,
				linear: linear?.enabled === false,
				commit: github?.enabled === false || commits?.enabled === false,
			},
		};
	}
	return cached;
}

function forget(): void {
	cached = undefined;
	repos.clear();
}

/** The same message with every text block's references linked; unchanged when there is nothing to do. */
function rewritten(message: Message): Message {
	if (message === null || typeof message !== "object" || !Array.isArray(message.content)) return message;
	let changed = false;
	const content = (message.content as TextBlock[]).map(block => {
		if (block === null || typeof block !== "object" || block.type !== "text" || typeof block.text !== "string") {
			return block;
		}
		const linked = linkify(block.text, options());
		if (linked === undefined) return block;
		changed = true;
		return { ...block, text: linked };
	});
	return changed ? { ...message, content } : message;
}

/** Tern draws omp's message components; `@oh-my-pi/pi-tui` is served to extensions, so wrap them. */
const Component: { prototype: { updateContent?: (message: Message, opts?: unknown) => void } } | undefined =
	await import("@oh-my-pi/pi-tui/chat/assistant-message")
		.then((module: any) =>
			typeof module.AssistantMessageComponent?.prototype?.updateContent === "function"
				? module.AssistantMessageComponent
				: undefined,
		)
		.catch(() => undefined);

type Patchable = { prototype: Record<string, unknown> };

/** omp's theme, whose `fg` colours the `(url)` omp prints after every link outside Tern. Imported dynamically: older omp builds serve other modules. */
const ThemeClass: Patchable | undefined = await import("@oh-my-pi/pi-tui/theme")
	.then((module: any) => (typeof module.Theme?.prototype?.fg === "function" ? module.Theme : undefined))
	.catch(() => undefined);

/** Zero-width, so omp wraps lines as if the URL were not there. */
const HIDDEN = "\u2060";
const HIDDEN_URL = new RegExp(` ?(?:\\u001b\\]8;;[^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\))?${HIDDEN}(?:\\u001b\\]8;;(?:\\u0007|\\u001b\\\\))?`, "g");
const PATCHED = Symbol.for("omp-refs.hidden-urls");

/** omp's view of the terminal; `hyperlinks` is whether it draws links as OSC 8, with the URL then clickable on the text. */
const terminal: { hyperlinks?: boolean } | undefined = await import("@oh-my-pi/pi-tui/terminal-capabilities")
	.then((module: any) => (typeof module.TERMINAL === "object" ? module.TERMINAL : undefined))
	.catch(() => undefined);

/** Whether link URLs are hidden in this session, for /reflinks. */
function urlsState(): string {
	if (process.env.TERM_PROGRAM === "tern") return "hidden by Tern";
	if (ThemeClass === undefined || terminal === undefined) return "shown (this omp build cannot hide them)";
	return terminal.hyperlinks === true ? "hidden (the link text is clickable)" : "shown (omp does not draw hyperlinks in this terminal; if it supports OSC 8, set tui.hyperlinks to always)";
}

/**
 * Outside Tern omp draws every link as `text (url)`, which buries a reply in URLs. For the links this
 * file writes (their URL ends in `#omp-refs`) the URL is drawn as a zero-width mark and the rendered
 * rows lose it with the space before it; the link text stays clickable where the terminal has OSC 8.
 * Tern draws links itself and hides the URL, so it is left alone. If omp changes either hook, the URLs
 * simply show again.
 */
function hideUrls(): void {
	if (process.env.TERM_PROGRAM === "tern") return;
	const theme = ThemeClass?.prototype as { fg?: (...args: unknown[]) => unknown } | undefined;
	const component = Component?.prototype as { render?: (...args: unknown[]) => unknown } | undefined;
	if (theme?.fg === undefined || component?.render === undefined) return;
	const fg = theme.fg;
	const render = component.render;
	if ((fg as unknown as Record<symbol, boolean>)[PATCHED] === true) return;
	const patchedFg = function (this: unknown, color: unknown, text: unknown, ...rest: unknown[]): unknown {
		if (terminal?.hyperlinks === true && color === "mdLinkUrl" && typeof text === "string" && text.endsWith(`#${MARKER})`)) return HIDDEN;
		return fg.call(this, color, text, ...rest);
	};
	(patchedFg as unknown as Record<symbol, boolean>)[PATCHED] = true;
	theme.fg = patchedFg;
	component.render = function (this: unknown, ...args: unknown[]): unknown {
		const rows = render.apply(this, args);
		return Array.isArray(rows) ? rows.map(row => (typeof row === "string" && row.includes(HIDDEN) ? row.replace(HIDDEN_URL, "") : row)) : rows;
	};
}

export default function refs(pi: any): void {
	note(`loaded (component ${Component === undefined ? "unavailable" : "found"})`);
	hideUrls();

	// Older omp builds (18.10 and earlier) expose neither render hook: references stay plain there.
	let drawing = "none (this omp build has no render hook; update omp)";
	let wrapper: ((message: Message, opts?: unknown) => void) | undefined;

	// Another extension that patches the same method at its own session start (omp-stretch does)
	// replaces this wrapper, so wrap again then. Rewriting is idempotent: an extra layer is harmless.
	function wrap(): void {
		const proto = Component?.prototype;
		if (proto === undefined || proto.updateContent === undefined || proto.updateContent === wrapper) return;
		const inner = proto.updateContent;
		wrapper = function (this: unknown, message: Message, opts?: unknown): void {
			const linked = rewritten(message);
			if (linked !== message) note("rewrote a message");
			return inner.call(this, linked, opts);
		};
		proto.updateContent = wrapper;
		drawing = "message component";
	}

	pi.on("session_start", (_event: unknown, ctx: any) => {
		wrap();
		config = readConfig();
		const contextCwd = ctx?.cwd ?? ctx?.session?.cwd;
		if (typeof contextCwd === "string" && contextCwd !== "") cwd = contextCwd;
		forget();
	});

	pi.on("session_switch", (_event: unknown, ctx: any) => {
		const contextCwd = ctx?.cwd ?? ctx?.session?.cwd;
		if (typeof contextCwd === "string" && contextCwd !== "") {
			cwd = contextCwd;
			forget();
		}
	});

	pi.registerCommand("reflinks", {
		description: "Show the PR/ticket link settings, or preview a rewrite: /reflinks [text]",
		handler: async (args: string, ctx: any) => {
			const typed = args.trim();
			if (typed !== "") {
				const linked = linkify(typed, options());
				if (linked === undefined) {
					ctx.ui.notify(`Nothing to link in: ${typed}`, "info");
					return;
				}
				const pairs: string[] = [];
				for (const match of linked.matchAll(/\[`?([^\]`]+)`?\]\(([^)]+)\)/g)) pairs.push(`${match[1]} → ${match[2].replace(`#${MARKER}`, "")}`);
				ctx.ui.notify(pairs.join("\n"), "info");
				return;
			}
			const settings = options();
			const shown = iconsOf(settings);
			const state = (off: boolean | undefined, icon: string): string => `${off === true ? "off" : "on"}, icon ${icon || "(none)"}`;
			ctx.ui.notify(
				[
					`github: ${state(settings.off.github, shown.github)}, repo ${settings.repo ?? "(none — #123 stays plain)"}`,
					`commits: ${state(settings.off.commit, shown.commit)}`,
					`linear: ${state(settings.off.linear, shown.linear)}, workspace ${settings.workspace === "" ? "(unset)" : settings.workspace}, teams ${settings.teams.length === 0 ? "(unset — tickets stay plain)" : settings.teams.join(", ")}`,
					`config: ${CONFIG_PATH}`,
					`cwd: ${cwd}`,
					`drawing: ${drawing}`,
					`urls: ${urlsState()}`,
				].join("\n"),
				"info",
			);
		},
	});

	if (Component?.prototype.updateContent !== undefined) {
		wrap();
		return;
	}

	// A plain terminal draws replies through omp's text renderers instead. Older omp builds have
	// neither hook: the extension still loads and /reflinks still works, but nothing is drawn.
	if (typeof pi.registerAssistantTextRenderer !== "function") {
		note("no renderer hook: links stay plain");
		return;
	}
	drawing = "text renderer";
	pi.registerAssistantTextRenderer(({ text, streaming }: { text: string; streaming?: boolean }) => {
		if (streaming === true) return undefined;
		const linked = linkify(text, options());
		if (linked !== undefined) note("rendered");
		return linked;
	});
}
