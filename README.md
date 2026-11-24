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

Left alone: fenced blocks, other inline code, existing markdown links, bare URLs, and any `KEY-12`
whose key is not in the configured team list.

## Install

    omp plugin link ~/Projects/omp-refs

Extensions load when an omp process starts, so sessions already running keep plain references until
they restart.

Needs omp 18.22 or newer. Checked with 18.22.0, 18.22.1 and 19.1.1. Builds up to 18.10.3 export
neither `@oh-my-pi/pi-tui/chat/assistant-message` nor `registerAssistantTextRenderer`, so the
extension loads there, `/reflinks` answers, and replies stay plain. Update omp (`brew upgrade omp`
for Homebrew).

## Settings

At `~/.omp/agent/refs.json`:

```json
{
  "repo": "acme/widgets",
  "linearWorkspace": "acme",
  "linearTeams": ["ABC", "OPS"],
  "icons": { "github": "⎇", "linear": "⚑", "commit": "●" }
}
```

- `repo` — used for bare `#123`. Defaults to the `origin` remote of the session's directory; without
  one, bare references stay plain. `owner/repo#123` always links on its own.
- `linearWorkspace` — the `linear.app/<workspace>` slug. Unset leaves tickets plain.
- `linearTeams` — the team keys worth linking, so `UTF-8` and `SHA-256` never become tickets. Unset
  leaves tickets plain.
- `icons` — the symbol at the left of each tag, per kind: `github` (issues and PRs, default `⎇`),
  `linear` (tickets, default `⚑`), `commit` (SHAs, default `●`). An empty string drops the icon;
  backticks and line breaks are removed.

A bare `#123` links to `/issues/123`, which GitHub redirects to the pull request when that number is
one.

## Commands

- `/reflinks` — resolved repo, workspace, teams, icons, config path, cwd, and the drawing hook in use
  (`message component`, `text renderer`, or `none` on a build too old to draw links).
- `/reflinks #4705 ABC-146` — preview the targets without touching a reply.

## How it draws

Tern renders omp's own message components, so `AssistantMessageComponent.updateContent` is wrapped,
the way [omp-stretch](https://github.com/materemias/omp-stretch) does. Where that internal module is
unavailable, the extension falls back to `pi.registerAssistantTextRenderer`, which is what a plain
terminal uses. If a future omp reshapes those hooks, link rendering stops and the `drawing:` line of
`/reflinks` says so.

The wrapper is installed at load and again at every session start, because an extension that patches
the same method at its own session start (omp-stretch does) replaces it. Inside a stretch's clickable
text a reference cannot be a second link; outside it, references link as usual.

Set `OMP_REFS_DEBUG=1` to log loads and rewrites to `/tmp/omp-refs-debug.log`.

## Tests

`refs-core.js` is pure JavaScript, so any engine can run its tests:

    cd ~/Projects/omp-refs
    sed 's/^export //' refs-core.js > /tmp/core.js
    cat /tmp/core.js refs.test.js > /tmp/run.js
    /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc /tmp/run.js

## License

MIT
