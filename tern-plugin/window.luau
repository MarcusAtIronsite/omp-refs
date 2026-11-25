--!strict
-- Chips for the links omp-refs writes. Every one ends in the fragment #omp-refs (refs-core.js, MARKER),
-- which GitHub and Linear ignore and these selectors key on, so ordinary links keep their look. The
-- host and path pick the kind: a GitHub issue or PR, a commit, a Linear ticket.
--
-- Tern draws a reply in two layouts (console and reader) and underlines its links in each with its own
-- rule, so every rule below is written once per layout, at least as specific as Tern's.
--
-- When this plugin is installed, omp-refs drops the Unicode icons from the link text (refs.ts,
-- ternDrawsIcons) and the icons here take their place.

local function encode(svg: string): string
	local escaped = string.gsub(svg, "[<>#]", { ["<"] = "%3C", [">"] = "%3E", ["#"] = "%23" })
	return `url("data:image/svg+xml,{escaped}")`
end

-- GitHub's mark and Octicons' git-commit (16px), and Linear's logo (24px).
local GITHUB = encode(
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'/></svg>"
)
local COMMIT = encode(
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z'/></svg>"
)
local LINEAR = encode(
	"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z'/></svg>"
)

local MARK = "[href$='#omp-refs']"

local LAYOUTS = {
	".md a",
	".sf-chat-console .sf-md .md a",
	".sf-chat-reader [data-role^='omp.assistant'] > .sf-md .md a",
}

-- One kind: the attribute filter that picks it, its tint, and its icon.
local KINDS = {
	{ filter = "[href^='https://github.com/'][href*='/commit/']", tint = "#8b949e", icon = COMMIT },
	{ filter = "[href^='https://github.com/']:not([href*='/commit/'])", tint = "#a371f7", icon = GITHUB },
	{ filter = "[href^='https://linear.app/']", tint = "#5e6ad2", icon = LINEAR },
}

local TEXT = "var(--omp-text, var(--tv-fg, var(--t1)))"

-- The three rules of one chip: its box, its hover, its icon. No string interpolation: Luau reads a brace there as code.
local function rules(sel: string, tint: string, icon: string): string
	return table.concat({
		sel .. " {",
		"	--ref: " .. tint .. ";",
		"	box-shadow: none;",
		"	text-decoration: none;",
		"	white-space: nowrap;",
		"	padding: 0 0.45em 0 0.35em;",
		"	border: 1px solid color-mix(in srgb, var(--ref) 55%, transparent);",
		"	border-radius: 0.5em;",
		"	background: color-mix(in srgb, var(--ref) 14%, transparent);",
		"	color: color-mix(in srgb, var(--ref) 65%, " .. TEXT .. ");",
		"}",
		sel .. ":hover {",
		"	box-shadow: none;",
		"	text-decoration: none;",
		"	border-color: var(--ref);",
		"	background: color-mix(in srgb, var(--ref) 26%, transparent);",
		"}",
		sel .. "::before {",
		'	content: "";',
		"	display: inline-block;",
		"	width: 1em;",
		"	height: 1em;",
		"	margin-right: 0.35em;",
		"	vertical-align: -0.15em;",
		"	background-color: var(--ref);",
		"	-webkit-mask: " .. icon .. " center / contain no-repeat;",
		"	mask: " .. icon .. " center / contain no-repeat;",
		"}",
	}, "\n")
end

local css = {}
for _, layout in LAYOUTS do
	for _, kind in KINDS do
		table.insert(css, rules(layout .. MARK .. kind.filter, kind.tint, kind.icon))
	end
end

tern.css("chips", table.concat(css, "\n"))
