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
// Settings live in ~/.omp/agent/refs.json:
//   { "repo": "owner/repo", "linearWorkspace": "acme", "linearTeams": ["ABC", "OPS"],
//     "icons": { "github": "⎇", "linear": "⚑", "commit": "●" } }
// `repo` defaults to the `origin` remote of the session's directory. Without a Linear workspace and
// team list, ticket references stay plain; without a GitHub repo, bare `#123` stays plain.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MARKER, iconsOf, linkify } from "./refs-core.js";

type Config = {
	repo?: string;
	linearWorkspace?: string;
	linearTeams?: string[];
	icons?: { github?: string; linear?: string; commit?: string };
};

type TextBlock = { type: string; text?: string };
type Message = { content?: unknown };
type Options = { repo: string | undefined; workspace: string; teams: string[]; icons: Config["icons"] };

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

/** `owner/repo` for a directory's origin remote, or the configured repo. */
function repoOf(directory: string): string | undefined {
	if (config.repo !== undefined && config.repo !== "") return config.repo;
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
		cached = {
			repo: repoOf(cwd),
			workspace: config.linearWorkspace ?? "",
			teams: config.linearTeams ?? [],
			icons: ternDrawsIcons() ? { github: "", linear: "", commit: "" } : config.icons,
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

export default function refs(pi: any): void {
	note(`loaded (component ${Component === undefined ? "unavailable" : "found"})`);

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
			ctx.ui.notify(
				[
					`repo: ${settings.repo ?? "(none — #123 stays plain)"}`,
					`linear: ${settings.workspace === "" ? "(unset — tickets stay plain)" : settings.workspace}`,
					`teams: ${settings.teams.length === 0 ? "(unset)" : settings.teams.join(", ")}`,
					`icons: github ${shown.github || "(none)"}, linear ${shown.linear || "(none)"}, commit ${shown.commit || "(none)"}`,
					`config: ${CONFIG_PATH}`,
					`cwd: ${cwd}`,
					`drawing: ${drawing}`,
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
