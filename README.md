# omp-refs

Clickable GitHub pull-request and Linear ticket references in [omp](https://omp.sh) replies.

`#4705`, `owner/repo#7` and `ABC-146` are drawn as links to the PR, issue or ticket, so a reference
opens in the browser instead of being copied into one. Each is a link whose text is a code span with
an icon, `` [`⎇ #4705`](…) ``, so it draws as a tag. The reply's stored text never changes: this
rewrites only what the transcript draws, so the session file, `-p` output and copy-paste stay plain.
Copying a drawn reference includes its icon.

Commit SHAs link too: 7 to 40 lowercase hex characters containing both a digit and a letter
(`f328eb4`), bare or as `owner/repo@f328eb4`, and a code span that is exactly one SHA
(`` `f328eb4` ``), which keeps its code style inside the link. A bare SHA needs the repo, and an
all-digit SHA stays plain. Nothing is checked offline, so a SHA from another repo links to a 404.

Links the model writes itself become chips too when the link text is exactly the reference its URL
names: `[SW-3152](https://linear.app/…/issue/SW-3152)`, `[#4329](…/pull/4329)`, `[PR #4329](…)`, or a
SHA on a commit URL. A link with descriptive text, one with a query or fragment, an image, and one in
code keep their form.

Left alone: fenced blocks, other inline code, other markdown links, bare URLs, and any `KEY-12` whose
key is not in the configured team list.

## Install

    omp plugin link ~/Projects/omp-refs

Extensions load when an omp process starts, so sessions already running keep plain references until
they restart.

Needs omp 18.22 or newer. Checked with 18.22.0, 18.22.1 and 19.1.1. Builds up to 18.10.3 export
neither `@oh-my-pi/pi-tui/chat/assistant-message` nor `registerAssistantTextRenderer`, so the
extension loads there, `/reflinks` answers, and replies stay plain. Update omp (`brew upgrade omp`
for Homebrew).

## Settings

At `~/.omp/agent/refs.json`, one object per provider under `providers`:

```json
{
  "providers": {
    "github": {
      "repo": "acme/widgets",
      "icon": "⎇",
      "color": "#a371f7",
      "commits": { "icon": "●", "color": "#8b949e" }
    },
    "linear": {
      "workspace": "acme",
      "teams": ["ABC", "OPS"],
      "icon": "⚑",
      "color": "#5e6ad2"
    }
  }
}
```

Every key is optional. Fields every provider takes:

- `enabled` — `false` turns the provider off: its references stay plain. Default `true`.
- `icon` — the symbol at the left of each tag. An empty string drops it; backticks and line breaks
  are removed. Defaults: `⎇` GitHub, `⚑` Linear, `●` commits.
- `color` — the tint of the chip in Tern, as a hex colour (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`);
  anything else keeps the default. It sets the border, the fill and the logo; the text keeps Tern's
  code colour. Plain terminals use the theme's colours and ignore it. The Tern plugin reads it when
  it loads, so run `tern plugin reload omp-refs` after a change. Defaults: `#a371f7` GitHub,
  `#5e6ad2` Linear, `#8b949e` commits.

`github` (issues, pull requests and commits):

- `repo` — used for bare `#123` and bare SHAs. Defaults to the `origin` remote of the session's
  directory; without one, bare references stay plain. `owner/repo#123` and `owner/repo@sha` always
  link on their own.
- `commits` — the commit SHAs, with the same `enabled`, `icon` and `color`. Turning `github` off turns
  commits off too.

`linear`:

- `workspace` — the `linear.app/<workspace>` slug. Unset leaves tickets plain.
- `teams` — the team keys worth linking, so `UTF-8` and `SHA-256` never become tickets. Unset leaves
  tickets plain.

The earlier flat keys (`repo`, `linearWorkspace`, `linearTeams`, `icons`, `colors`) are no longer
read; move them under `providers`.

A bare `#123` links to `/issues/123`, which GitHub redirects to the pull request when that number is
one.

## Commands

- `/reflinks` — each provider's state, icon and settings, the config path, cwd, the drawing hook in
  use, and whether link URLs are hidden (`drawing:` is `message component`, `text renderer`, or
  `none` on a build too old to draw links).
- `/reflinks #4705 ABC-146` — preview the targets without touching a reply.

## How it draws

Tern renders omp's own message components, so `AssistantMessageComponent.updateContent` is wrapped,
the way [omp-stretch](https://github.com/materemias/omp-stretch) does. Where that internal module is
unavailable, the extension falls back to `pi.registerAssistantTextRenderer`, which is what a plain
terminal uses. If a future omp reshapes those hooks, link rendering stops and the `drawing:` line of
`/reflinks` says so.

The wrapper is installed at load and again at every session start, because an extension that patches
the same method at its own session start (omp-stretch does) replaces it. A stretch (`{{short|long}}`)
is itself a link and a link cannot hold another, so references inside one stay plain, nested or still
streaming; references outside it link as usual.

Set `OMP_REFS_DEBUG=1` to log loads and rewrites to `/tmp/omp-refs-debug.log`.

## Tern chips

Tern draws replies as HTML and lets a plugin add CSS. `tern-plugin/` turns the links omp-refs writes
into tinted chips with a border, rounded corners and the GitHub or Linear logo (a commit gets the
git-commit mark):

    tern plugin link ~/Projects/omp-refs/tern-plugin

Every link omp-refs writes ends in the fragment `#omp-refs`, which GitHub and Linear ignore; the CSS
keys on it, so ordinary links keep their look. With the plugin linked, omp-refs drops the Unicode
icons from the link text so the logos are not doubled. It finds the plugin through Tern's config
folder (`~/Library/Application Support/Tern` on macOS, else `TERN_CONFIG_DIR`); without the plugin,
or outside Tern, the Unicode icons stay.

The selectors depend on Tern's markup. A Tern update that renames it loses the chips, not the links.

## Plain terminals

omp draws every link as `text (url)`, which buries a reply in URLs. Outside Tern, omp-refs draws the
URL of its own links as nothing, so `⎇ #4329` stands alone and stays clickable through OSC 8 where
the terminal supports it. Other links keep their URL.

This only happens when omp itself draws hyperlinks in the terminal (`tui.hyperlinks`: `auto` detects
support, `always` forces it). When it does not, the URL stays visible, because it is the only way to
open the link. If your terminal handles OSC 8 and the URLs still show, set `tui.hyperlinks` to
`always`. `/reflinks` has a `urls:` line saying which case you are in.

It works by wrapping omp's `Theme.fg` and the message component's `render`; if omp changes either,
the URLs show again and nothing breaks.

## Tests

`refs-core.js` is pure JavaScript, so any engine can run its tests:

    cd ~/Projects/omp-refs
    sed 's/^export //' refs-core.js > /tmp/core.js
    cat /tmp/core.js refs.test.js > /tmp/run.js
    /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc /tmp/run.js

## License

MIT
