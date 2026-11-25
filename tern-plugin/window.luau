--!strict
-- Chips for the links omp-refs writes. Every one ends in the fragment #omp-refs (refs-core.js, MARKER),
-- which GitHub and Linear ignore and these selectors key on, so ordinary links keep their look. The
-- host and path pick the kind: a GitHub issue or PR, a commit, a Linear ticket.
--
-- Tern draws a reply in two layouts (console and reader) and underlines its links in each with its own
-- rule, so every rule below is written once per layout, at least as specific as Tern's.
--
-- Tern hit-tests a link by its text and its pseudo-element boxes, not by its padding, margins or the
-- background of an inner element. So the chip has no padding: the icon box (::before) and a short
-- ::after carry the spacing, and the inner code span loses its own padding, so no part of the chip
-- is a dead spot for a click. Tern has no CSS `mask`, so each logo is a background image whose fill
-- is the chip's tint.
--
-- When this plugin is installed, omp-refs drops the Unicode icons from the link text (refs.ts,
-- ternDrawsIcons) and the icons here take their place.

local function encode(svg: string, fill: string): string
	local filled = string.gsub(svg, "FILL", fill)
	local escaped = string.gsub(filled, "[<>#]", { ["<"] = "%3C", [">"] = "%3E", ["#"] = "%23" })
	return `url("data:image/svg+xml,{escaped}")`
end

-- GitHub's mark and Octicons' git-commit (16px), and Linear's logo (24px).
local GITHUB =
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='FILL' d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'/></svg>"
local COMMIT =
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='FILL' d='M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z'/></svg>"
local LINEAR =
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='FILL' d='M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z'/></svg>"

local MARK = "[href$='#omp-refs']"

local LAYOUTS = {
	".md a",
	".sf-chat-console .sf-md .md a",
	".sf-chat-reader [data-role^='omp.assistant'] > .sf-md .md a",
}

-- The tints are the defaults below, overridden by `color` in ~/.omp/agent/refs.json (the file refs.ts
-- reads): providers.github.color for issues and PRs, providers.github.commits.color for commits,
-- providers.linear.color for tickets. Only a hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) is taken,
-- since the value lands in CSS and in the logo's SVG. The file is read when the plugin loads:
-- `tern plugin reload omp-refs` applies a change.
local function configuredColors(): { [string]: string }
	local colors: { [string]: string } = {}
	local home = tern.getenv("HOME") or tern.getenv("USERPROFILE")
	if not home then
		return colors
	end
	local read, text = pcall(tern.fs.read, home .. "/.omp/agent/refs.json")
	if not read or type(text) ~= "string" then
		return colors
	end
	local decoded, config = pcall(tern.json.decode, text)
	if not decoded or type(config) ~= "table" then
		return colors
	end
	local function take(kind: string, source: any)
		local value = type(source) == "table" and source.color or nil
		local size = type(value) == "string" and #value or 0
		if type(value) == "string" and string.match(value, "^#%x+$") and (size == 4 or size == 5 or size == 7 or size == 9) then
			colors[kind] = value
		end
	end
	local providers = config.providers
	local github = type(providers) == "table" and providers.github or nil
	take("github", github)
	take("commit", type(github) == "table" and github.commits or nil)
	take("linear", type(providers) == "table" and providers.linear or nil)
	return colors
end

local COLORS = configuredColors()

-- One kind: the attribute filter that picks it, its tint, and its logo.
local KINDS = {
	{ filter = "[href^='https://github.com/'][href*='/commit/']", tint = COLORS.commit or "#8b949e", svg = COMMIT },
	{ filter = "[href^='https://github.com/']:not([href*='/commit/'])", tint = COLORS.github or "#a371f7", svg = GITHUB },
	{ filter = "[href^='https://linear.app/']", tint = COLORS.linear or "#5e6ad2", svg = LINEAR },
}

-- The rules of one chip: its box, its hover, its inner code span, its icon box and its end cap. No
-- string interpolation: Luau reads a brace there as code.
local function rules(sel: string, tint: string, svg: string): string
	return table.concat({
		sel .. " {",
		"	--ref: " .. tint .. ";",
		"	display: inline-block;",
		"	box-shadow: none;",
		"	text-decoration: none;",
		"	white-space: nowrap;",
		"	line-height: 1.25;",
		"	vertical-align: baseline;",
		"	padding: 0;",
		"	border: 1px solid color-mix(in srgb, var(--ref) 55%, transparent);",
		"	border-radius: 0.5em;",
		"	background: color-mix(in srgb, var(--ref) 14%, transparent);",
		"}",
		sel .. ":hover {",
		"	box-shadow: none;",
		"	text-decoration: none;",
		"	border-color: var(--ref);",
		"	background: color-mix(in srgb, var(--ref) 26%, transparent);",
		"}",
		sel .. " code {",
		"	padding: 0;",
		"	margin: 0;",
		"	border: 0;",
		"	line-height: inherit;",
		"	font-size: 0.9em;",
		"	background: transparent;",
		"}",
		sel .. "::before {",
		'	content: "";',
		"	display: inline-block;",
		"	width: 1.7em;",
		"	height: 1em;",
		"	vertical-align: -0.15em;",
		"	background: " .. encode(svg, tint) .. " 0.35em center / 1em 1em no-repeat;",
		"}",
		sel .. "::after {",
		'	content: "";',
		"	display: inline-block;",
		"	width: 0.45em;",
		"	height: 1em;",
		"}",
	}, "\n")
end

local css = {}
for _, layout in LAYOUTS do
	for _, kind in KINDS do
		table.insert(css, rules(layout .. MARK .. kind.filter, kind.tint, kind.svg))
	end
end

tern.css("chips", table.concat(css, "\n"))
