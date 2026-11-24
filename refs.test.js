// Tests for refs-core.js. No framework: run with the commands in README.md.
const opts = { repo: "acme/widgets", teams: ["ABC", "OPS"], workspace: "acme" };
let failed = 0;

function expect(name, input, wanted) {
	const got = linkify(input, opts);
	if (got !== wanted) {
		failed += 1;
		print("FAIL " + name);
		print("  input:  " + JSON.stringify(input));
		print("  wanted: " + JSON.stringify(wanted));
		print("  got:    " + JSON.stringify(got));
	}
}

expect("both refs", "Fixes #4705 and ABC-146.", "Fixes [#4705](https://github.com/acme/widgets/issues/4705) and [ABC-146](https://linear.app/acme/issue/ABC-146).");
expect("inline code", "run `#4705` and `ABC-146`", undefined);
expect("fence", "```\n#4705 ABC-146\n```", undefined);
expect("mermaid fence", "```mermaid\nA --> #4705\n```\nok", undefined);
expect("bare url", "see https://github.com/acme/widgets/pull/4705", undefined);
expect("linear url", "see https://linear.app/acme/issue/ABC-146", undefined);
expect("existing link", "see [PR #4705](https://github.com/acme/widgets/pull/4705)", undefined);
expect("owner/repo ref", "in acme/widgets#7 now", "in [acme/widgets#7](https://github.com/acme/widgets/issues/7) now");
expect("non-team key", "UTF-8, SHA-256, ISO-8601, GPT-5", undefined);
expect("single digit", "option #1 and #9", undefined);
expect("bracket ref", "see [#4705] in the list", undefined);
expect("ticket only", "ABC-146", "[ABC-146](https://linear.app/acme/issue/ABC-146)");
expect("hyphen before ticket", "asdf-ABC-146", undefined);
expect("plain prose", "Nothing to link here.", undefined);
expect("idempotent", "[#4705](https://github.com/acme/widgets/issues/4705)", undefined);
const once = linkify("see #4705 and ABC-146", opts);
expect("second pass", once, undefined);

// No repo configured: bare refs stay literal, tickets still link.
const noRepo = linkify("see #4705 and ABC-146", { teams: ["ABC"], workspace: "acme" });
if (noRepo !== "see #4705 and [ABC-146](https://linear.app/acme/issue/ABC-146)") {
	failed += 1;
	print("FAIL no repo: " + JSON.stringify(noRepo));
}

// No Linear settings: tickets stay literal.
const noLinear = linkify("#4705 and ABC-146", { repo: "acme/widgets", teams: [], workspace: "" });
if (noLinear !== "[#4705](https://github.com/acme/widgets/issues/4705) and ABC-146") {
	failed += 1;
	print("FAIL no linear: " + JSON.stringify(noLinear));
}

const SHA = "f328eb49075cbba210aeb84c78caf3700c35687a";
const commit = (text, repo) => `[${text}](https://github.com/${repo}/commit/${text.replace(/`/g, "").replace(/^.*@/, "")})`;
expect("bare sha", "fixed in f328eb4.", "fixed in " + commit("f328eb4", "acme/widgets") + ".");
expect("full sha", "at " + SHA + " now", "at " + commit(SHA, "acme/widgets") + " now");
expect("backticked sha", "see `f328eb4` there", "see [`f328eb4`](https://github.com/acme/widgets/commit/f328eb4) there");
expect("repo sha", "in acme/other@f328eb4 too", "in [acme/other@f328eb4](https://github.com/acme/other/commit/f328eb4) too");
expect("backticked repo sha", "`acme/other@f328eb4`", "[`acme/other@f328eb4`](https://github.com/acme/other/commit/f328eb4)");
expect("words and numbers", "defaced decade 1234567 deadbeef 20250101", undefined);
expect("backticked number", "`1234567` and `deadbeef`", undefined);
expect("code span with more", "run `git show f328eb4`", undefined);
expect("sha in fence", "```\nf328eb4\n```", undefined);
expect("sha in url", "https://github.com/acme/widgets/commit/f328eb4", undefined);
expect("sha in link", "[`f328eb4`](https://github.com/acme/widgets/commit/f328eb4)", undefined);
expect("sha in filename", "src/f328eb4.ts and f328eb4-x and a#f328eb4", undefined);
expect("uuid", "550e8400-e29b-41d4-a716-446655440000", undefined);
expect("too short or long", "f328eb and " + SHA + "0", undefined);
const shaOnce = linkify("see f328eb4 and `f328eb4`", opts);
expect("sha second pass", shaOnce, undefined);

// No repo: a bare SHA has nowhere to point, a repo-qualified one still links.
const noRepoSha = linkify("f328eb4, `f328eb4` and acme/other@f328eb4", { teams: [], workspace: "" });
if (noRepoSha !== "f328eb4, `f328eb4` and [acme/other@f328eb4](https://github.com/acme/other/commit/f328eb4)") {
	failed += 1;
	print("FAIL no repo sha: " + JSON.stringify(noRepoSha));
}

print(failed === 0 ? "all tests passed" : failed + " failed");
