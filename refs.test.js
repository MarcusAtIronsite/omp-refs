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

print(failed === 0 ? "all tests passed" : failed + " failed");
