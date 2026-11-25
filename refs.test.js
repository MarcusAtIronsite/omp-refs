// Tests for refs-core.js. No framework: run with the commands in README.md.
const opts = { repo: "acme/widgets", teams: ["ABC", "OPS"], workspace: "acme" };
const GH = "\u2387";
const LIN = "\u2691";
const DOT = "\u25cf";
let failed = 0;

const issue = (label, url) => "[`" + GH + " " + label + "`](" + url + "#omp-refs)";
const ticket = key => "[`" + LIN + " " + key + "`](https://linear.app/acme/issue/" + key + "#omp-refs)";
const commit = (label, repo, sha) => "[`" + DOT + " " + label + "`](https://github.com/" + repo + "/commit/" + sha + "#omp-refs)";

function expect(name, input, wanted, options = opts) {
	const got = linkify(input, options);
	if (got !== wanted) {
		failed += 1;
		print("FAIL " + name);
		print("  input:  " + JSON.stringify(input));
		print("  wanted: " + JSON.stringify(wanted));
		print("  got:    " + JSON.stringify(got));
	}
}

const widgets = n => "https://github.com/acme/widgets/issues/" + n;

expect("both refs", "Fixes #4705 and ABC-146.", "Fixes " + issue("#4705", widgets(4705)) + " and " + ticket("ABC-146") + ".");
expect("inline code", "run `#4705` and `ABC-146`", undefined);
expect("fence", "```\n#4705 ABC-146\n```", undefined);
expect("mermaid fence", "```mermaid\nA --> #4705\n```\nok", undefined);
expect("bare url", "see https://github.com/acme/widgets/pull/4705", undefined);
expect("linear url", "see https://linear.app/acme/issue/ABC-146", undefined);
expect("existing link", "see [the fix PR](https://github.com/acme/widgets/pull/4705)", undefined);
expect("owner/repo ref", "in acme/widgets#7 now", "in " + issue("acme/widgets#7", widgets(7)) + " now");
expect("non-team key", "UTF-8, SHA-256, ISO-8601, GPT-5", undefined);
expect("single digit", "option #1 and #9", undefined);
expect("bracket ref", "see [#4705] in the list", undefined);
expect("ticket only", "ABC-146", ticket("ABC-146"));
expect("hyphen before ticket", "asdf-ABC-146", undefined);
expect("plain prose", "Nothing to link here.", undefined);
expect("idempotent", issue("#4705", widgets(4705)), undefined);
const once = linkify("see #4705 and ABC-146", opts);
expect("second pass", once, undefined);

// No repo configured: bare refs stay literal, tickets still link.
expect("no repo", "see #4705 and ABC-146", "see #4705 and " + ticket("ABC-146"), { teams: ["ABC"], workspace: "acme" });

// No Linear settings: tickets stay literal.
expect("no linear", "#4705 and ABC-146", issue("#4705", widgets(4705)) + " and ABC-146", { repo: "acme/widgets", teams: [], workspace: "" });

// Commit SHAs.
const SHA = "f328eb49075cbba210aeb84c78caf3700c35687a";
expect("bare sha", "fixed in f328eb4.", "fixed in " + commit("f328eb4", "acme/widgets", "f328eb4") + ".");
expect("full sha", "at " + SHA + " now", "at " + commit(SHA, "acme/widgets", SHA) + " now");
expect("backticked sha", "see `f328eb4` there", "see " + commit("f328eb4", "acme/widgets", "f328eb4") + " there");
expect("repo sha", "in acme/other@f328eb4 too", "in " + commit("acme/other@f328eb4", "acme/other", "f328eb4") + " too");
expect("backticked repo sha", "`acme/other@f328eb4`", commit("acme/other@f328eb4", "acme/other", "f328eb4"));
expect("words and numbers", "defaced decade 1234567 deadbeef 20250101", undefined);
expect("backticked number", "`1234567` and `deadbeef`", undefined);
expect("code span with more", "run `git show f328eb4`", undefined);
expect("sha in fence", "```\nf328eb4\n```", undefined);
expect("sha in url", "https://github.com/acme/widgets/commit/f328eb4", undefined);
expect("sha in link", commit("f328eb4", "acme/widgets", "f328eb4"), undefined);
expect("sha in filename", "src/f328eb4.ts and f328eb4-x and a#f328eb4", undefined);
expect("uuid", "550e8400-e29b-41d4-a716-446655440000", undefined);
expect("too short or long", "f328eb and " + SHA + "0", undefined);
expect("sha second pass", linkify("see f328eb4 and `f328eb4`", opts), undefined);

// No repo: a bare SHA has nowhere to point, a repo-qualified one still links.
expect(
	"no repo sha",
	"f328eb4, `f328eb4` and acme/other@f328eb4",
	"f328eb4, `f328eb4` and " + commit("acme/other@f328eb4", "acme/other", "f328eb4"),
	{ teams: [], workspace: "" },
);

// Icons: configurable per kind; an empty string drops the icon, backticks cannot break the chip.
const custom = { ...opts, icons: { github: "PR", linear: "", commit: "a`b" } };
expect("custom github icon", "#4705", "[`PR #4705`](" + widgets(4705) + "#omp-refs)", custom);
expect("empty linear icon", "ABC-146", "[`ABC-146`](https://linear.app/acme/issue/ABC-146#omp-refs)", custom);
expect("backtick icon", "f328eb4", "[`ab f328eb4`](https://github.com/acme/widgets/commit/f328eb4#omp-refs)", custom);
expect("non-string icon falls back", "ABC-146", ticket("ABC-146"), { ...opts, icons: { linear: 5 } });
expect("partial icons keep defaults", "#4705 f328eb4", issue("#4705", widgets(4705)) + " [`x f328eb4`](https://github.com/acme/widgets/commit/f328eb4#omp-refs)", { ...opts, icons: { commit: "x" } });

// Stretchtext is a link itself, so references inside it stay plain; text around it links.
const after = " then " + issue("#4705", widgets(4705));
expect("inside stretch", "{{short #4705 ABC-146|long f328eb4}} then #4705", "{{short #4705 ABC-146|long f328eb4}}" + after);
expect("nested stretch", "{{a {{b #4705|c}} tail #4705|d}} then #4705", "{{a {{b #4705|c}} tail #4705|d}}" + after);
expect("streaming stretch", "ok #4705 {{short #4705|lo", "ok " + issue("#4705", widgets(4705)) + " {{short #4705|lo");
expect("backticked sha in stretch", "{{see `f328eb4`|more}} then #4705", "{{see `f328eb4`|more}}" + after);
expect("braces in code are not stretches", "`{{` then #4705", "`{{`" + after);
expect("braces in fence", "```\n{{\n```\n#4705", "```\n{{\n```\n" + issue("#4705", widgets(4705)));

// Links the model wrote itself: chips when the text is exactly the reference its URL names.
const pull = "https://github.com/acme/widgets/pull/4329";
expect("adopt linear", "see [ABC-146](https://linear.app/other/issue/ABC-146) now", "see " + "[`" + LIN + " ABC-146`](https://linear.app/other/issue/ABC-146#omp-refs)" + " now");
expect("adopt linear with slug", "[ABC-146](https://linear.app/acme/issue/ABC-146/fix-the-thing)", "[`" + LIN + " ABC-146`](https://linear.app/acme/issue/ABC-146/fix-the-thing#omp-refs)");
expect("adopt bold-wrapped", "**[ABC-146](https://linear.app/acme/issue/ABC-146)** is open", "**" + ticket("ABC-146") + "** is open");
expect("adopt issue", "[#4329](" + pull + ")", "[`" + GH + " #4329`](" + pull + "#omp-refs)");
expect("adopt PR prefix", "[PR #4329](" + pull + ")", "[`" + GH + " PR #4329`](" + pull + "#omp-refs)");
expect("adopt owner/repo", "[acme/widgets#4329](https://github.com/acme/widgets/issues/4329)", "[`" + GH + " acme/widgets#4329`](https://github.com/acme/widgets/issues/4329#omp-refs)");
expect("adopt commit prefix", "[f328eb4](https://github.com/acme/widgets/commit/" + SHA + ")", "[`" + DOT + " f328eb4`](https://github.com/acme/widgets/commit/" + SHA + "#omp-refs)");
expect("descriptive link text", "[the PR](" + pull + ") and [fix ABC-146](https://linear.app/acme/issue/ABC-146)", undefined);
expect("text names another number", "[#4330](" + pull + ")", undefined);
expect("adopt in code", "`[ABC-146](https://linear.app/acme/issue/ABC-146)`", undefined);
expect("adopt in stretch", "{{see [ABC-146](https://linear.app/acme/issue/ABC-146)|more}}", undefined);
expect("adopt image", "![ABC-146](https://linear.app/acme/issue/ABC-146)", undefined);
expect("adopt other host", "[ABC-146](https://example.com/issue/ABC-146)", undefined);
expect("adopt link with fragment", "[#4329](" + pull + "#issuecomment-1)", undefined);
expect("adopt second pass", linkify("[ABC-146](https://linear.app/acme/issue/ABC-146)", opts), undefined);

// Providers switched off stay plain, kind by kind; owner/repo forms and adopted links obey too.
const everything = "#4705 ABC-146 f328eb4 acme/other#7 [ABC-146](https://linear.app/acme/issue/ABC-146)";
const withOff = off => linkify(everything, { ...opts, off });
const noGithub = withOff({ github: true, commit: true });
expect("github off keeps linear", "#4705 acme/other#7 ABC-146", "#4705 acme/other#7 " + ticket("ABC-146"), { ...opts, off: { github: true } });
expect("linear off", "ABC-146 [ABC-146](https://linear.app/acme/issue/ABC-146) #4705", "ABC-146 [ABC-146](https://linear.app/acme/issue/ABC-146) " + issue("#4705", widgets(4705)), { ...opts, off: { linear: true } });
expect("commits off keeps issues", "#4705 f328eb4 `f328eb4` acme/other@f328eb4", issue("#4705", widgets(4705)) + " f328eb4 `f328eb4` acme/other@f328eb4", { ...opts, off: { commit: true } });
expect("all off", everything, undefined, { ...opts, off: { github: true, linear: true, commit: true } });
if (noGithub === undefined || noGithub.includes("#omp-refs)") === false || noGithub.includes(GH)) {
	failed += 1;
	print("FAIL github+commit off: " + JSON.stringify(noGithub));
}

print(failed === 0 ? "all tests passed" : failed + " failed");
