import type { AiLanguage, ToolId } from "./aiTools";

/* =========================================================================
 * Demonstration replies.
 *
 * When no AI backend is connected the workspace must never pretend a model
 * answered. These local samples are always labelled as demonstrations, are
 * prefixed with an honesty notice inside the markdown itself, and never claim
 * that code ran. They exist to show the response system (code, tables, maths,
 * structured reviews) without fabricating connectivity.
 * ========================================================================= */

const fence = (lang: string, code: string) => "```" + lang + "\n" + code.trim() + "\n```";
const pick = (lang: AiLanguage, v: Record<AiLanguage, string>) => v[lang];

const NOTICE =
  "> **Demonstration sample** — assembled locally in your browser. No AI model is connected and nothing here has been executed. Connect a model in AI preferences for a real answer.\n\n";

const label: Record<AiLanguage, string> = { python: "Python", javascript: "JavaScript", cpp: "C++" };
const f = (lang: AiLanguage) => (lang === "cpp" ? "cpp" : lang === "python" ? "python" : "javascript");

/* ---------------------------------- debug --------------------------------- */

function debug(lang: AiLanguage) {
  const broken = pick(lang, {
    python: fence("python", `
def find_user(users, user_id):
    return next((u for u in users if u["id"] == user_id), None)

user = find_user([{"id": 1, "name": "Ada"}], 2)
print(user["name"])
`),
    javascript: fence("javascript", `
const users = [{ id: 1, name: "Ada" }];

function findUser(id) {
  return users.find((user) => user.id === id);
}

const user = findUser(2);
console.log(user.name);
`),
    cpp: fence("cpp", `
#include <iostream>
#include <vector>

std::string find_user(const std::vector<std::string>& users, int id) {
    return users.at(id);
}

int main() {
    std::vector<std::string> users{"Ada"};
    std::cout << find_user(users, 2) << "\\n";
}
`),
  });

  const fixed = pick(lang, {
    python: fence("python", `
def find_user(users, user_id):
    return next((u for u in users if u["id"] == user_id), None)

user = find_user([{"id": 1, "name": "Ada"}], 2)

if user is None:
    print(f"No user with id 2")
else:
    print(user["name"])
`),
    javascript: fence("javascript", `
const users = [{ id: 1, name: "Ada" }];

function findUser(id) {
  return users.find((user) => user.id === id);
}

const user = findUser(2);

if (!user) {
  console.log("No user with id 2");
} else {
  console.log(user.name);
}
`),
    cpp: fence("cpp", `
#include <iostream>
#include <optional>
#include <string>
#include <vector>

std::optional<std::string> find_user(const std::vector<std::string>& users, std::size_t id) {
    if (id >= users.size()) return std::nullopt;
    return users[id];
}

int main() {
    std::vector<std::string> users{"Ada"};
    if (auto user = find_user(users, 2)) {
        std::cout << *user << "\\n";
    } else {
        std::cout << "No user with id 2\\n";
    }
}
`),
  });

  return (
    NOTICE +
    `## Error analysis

**Summary.** ${pick(lang, {
      python: "`TypeError: 'NoneType' object is not subscriptable`",
      javascript: "`TypeError: Cannot read properties of undefined (reading 'name')`",
      cpp: "`std::out_of_range` thrown by `std::vector::at`",
    })} means a value you expected to exist is missing at the moment you read from it.

| Signal | What it usually means |
| --- | --- |
| ${pick(lang, { python: "`None` returned from a lookup", javascript: "`find()` returned `undefined`", cpp: "Index past `size() - 1`" })} | The requested item was not in the collection |
| The error points at a property or index access | The *lookup* succeeded, but so did the empty result |
| It only fails for some inputs | The happy path never exercised the missing case |

### Where it breaks

${broken}

### Why it happens

${pick(lang, {
  python: "`next(..., None)` deliberately returns `None` when nothing matches. That default is useful — the bug is that the caller treats the lookup as guaranteed to succeed and indexes into the result immediately.",
  javascript: "`Array.prototype.find` returns `undefined` when no element matches. Accessing `.name` on that value is the failure; the lookup itself did nothing wrong.",
  cpp: "`users.at(2)` performs bounds checking, so an invalid index throws instead of producing undefined behaviour. The program assumes every id maps to a position in the vector.",
})}

### Suggested correction

${fixed}

### Verify it

1. Reproduce with an id that does not exist — you should now see a friendly message rather than a crash.
2. Check the boundary: the first and last valid ids.
3. Add a test that asserts the empty result is handled.

> Execution is not connected to this workspace, so the snippets have not been run. Copy them into the CODE RACE editor to verify.
`
  );
}

/* --------------------------------- review --------------------------------- */

function review(lang: AiLanguage) {
  const code = pick(lang, {
    python: fence("python", `
def apply_discount(prices, discount):
    total = 0
    for price in prices:
        total += price
    return total - total * discount
`),
    javascript: fence("javascript", `
function applyDiscount(prices, discount) {
  var total = 0;
  for (var i = 0; i < prices.length; i++) {
    total += prices[i];
  }
  return total - total * discount;
}
`),
    cpp: fence("cpp", `
double apply_discount(std::vector<double> prices, int discount) {
    double total = 0;
    for (int i = 0; i < prices.size(); i++) {
        total += prices[i];
    }
    return total - total * (discount / 100);
}
`),
  });

  return (
    NOTICE +
    `## Code review

### The code under review

${code}

### Quality assessment

| Area | Rating | Notes |
| --- | --- | --- |
| Correctness | Needs work | The happy path is right; invalid input is not guarded |
| Readability | Good | Small and focused, but names could be more precise |
| Performance | Acceptable | Single pass — fine for typical inputs |
| Security | Needs attention | Untrusted totals and rates are applied unchecked |

### Potential bugs

1. ${pick(lang, {
      python: "`discount` is never validated. A value of `1.2` produces a negative total; a string raises `TypeError`.",
      javascript: "`discount` is unvalidated and `+` will concatenate if a price arrives as a string (e.g. from a form).",
      cpp: "`discount / 100` is integer division, so a 15% discount becomes 0%. The vector is also copied on every call.",
    })}
2. Floating-point money maths accumulates rounding error — calculate in the smallest currency unit (cents) where possible.
3. An empty list returns \`0\` silently; callers cannot tell "no items" from "free order".

### Readability improvements

- Rename to express intent: \`apply_discount(prices, discount_rate)\`.
- Guard clauses at the top make the contract obvious.
- A docstring makes the range of valid rates explicit.

### Performance considerations

A single pass is already $O(n)$. The larger win is avoiding unnecessary copies: ${pick(lang, {
      python: "sum() over a generator keeps the loop tight.",
      javascript: "reduce() avoids the mutable loop variable.",
      cpp: "take the vector by const reference.",
    })}

### Security considerations

Discount rates and prices often come from user input. Validate ranges server-side, never trust client-side totals, and reject negative values.

### Suggested revision

${pick(lang, {
  python: fence("python", `
def apply_discount(prices: list[int], rate: float) -> int:
    """Return the total in cents after a 0–1 discount rate."""
    if not 0 <= rate <= 1:
        raise ValueError("rate must be between 0 and 1")
    if any(price < 0 for price in prices):
        raise ValueError("prices must be non-negative")
    return round(sum(prices) * (1 - rate))
`),
  javascript: fence("javascript", `
function applyDiscount(prices, rate) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError("rate must be between 0 and 1");
  }
  const total = prices.reduce((sum, price) => {
    if (!Number.isFinite(price)) throw new TypeError("price must be a number");
    return sum + price;
  }, 0);
  return Math.round(total * (1 - rate));
}
`),
  cpp: fence("cpp", `
double apply_discount(const std::vector<double>& prices, double rate) {
    if (rate < 0.0 || rate > 1.0) {
        throw std::invalid_argument("rate must be between 0 and 1");
    }
    double total = 0.0;
    for (double price : prices) {
        if (price < 0.0) throw std::invalid_argument("price must be non-negative");
        total += price;
    }
    return total * (1.0 - rate);
}
`),
    })}

> This review is a local demonstration. Paste your real code into a connected workspace for line-level feedback.
`
  );
}

/* ---------------------------------- learn --------------------------------- */

function learn(lang: AiLanguage) {
  return (
    NOTICE +
    `## Lesson: functions that return values

**Objectives** — by the end of this lesson you should be able to:

1. Define a function with a parameter and a return value.
2. Predict what a function returns before running it.
3. Explain the difference between \`return\` and printing.

### The core idea

A function is a named transformation: it takes inputs, performs a small, testable step, and hands a **result** back to the caller. Printing is for humans; returning is for programs.

${fence(f(lang), pick(lang, {
  python: `
def area(width: float, height: float) -> float:
    return width * height

room = area(3, 4)
print(room)          # 12
print(area(2, 5) + 1)
`,
  javascript: `
function area(width, height) {
  return width * height;
}

const room = area(3, 4);
console.log(room);          // 12
console.log(area(2, 5) + 1);
`,
  cpp: `
#include <iostream>

double area(double width, double height) {
    return width * height;
}

int main() {
    double room = area(3, 4);
    std::cout << room << "\\n";          // 12
    std::cout << area(2, 5) + 1 << "\\n";
}
`,
}))}

Trace it yourself: what is returned by \`area(2, 5) + 1\`? The call returns first, then the addition happens.

| Statement | Effect |
| --- | --- |
| \`return value;\` | Ends the function *and* sends the value back |
| \`print(value)\` | Shows the value; the function still returns nothing |
| No return statement | Returns ${pick(lang, { python: "`None`", javascript: "`undefined`", cpp: "an indeterminate value — always return explicitly" })} |

### Common misconception

> "If I print the result, the function returned it."

Not quite — printing is a side effect. Another function can only use a value that was **returned**.

### Knowledge check

Before we continue, answer this in your own words:

1. What does \`area(3, 4)\` evaluate to, and what would \`print(area(3, 4))\` add?
2. Write a function \`perimeter(width, height)\` and state its return type.
3. What happens if you forget \`return\` and then add \`1\` to the result?

Reply with your answers and I'll check them. I won't reveal the solution until you've had a go.

### Suggested next topics

- Parameters vs. arguments
- Pure functions and side effects
- Testing a function at its boundaries

*Demo lesson — connect a model to get a lesson adapted to your learning profile.*
`
  );
}

/* --------------------------------- explain -------------------------------- */

function explain(lang: AiLanguage) {
  return (
    NOTICE +
    `## How APIs work

**In one line:** an API is a contract that lets one program ask another for something without knowing how it is built inside.

### A useful analogy

Think of a restaurant. The menu is the API: it lists what you can ask for and what you will get. You do not walk into the kitchen — you place an order in a known format, and food comes back.

### The request / response cycle

1. Your code sends a request to a **URL** (the endpoint).
2. The request has a **method** that states intent — \`GET\` to read, \`POST\` to create.
3. **Headers** carry metadata (auth, content type); an optional **body** carries data.
4. The server replies with a **status code** and usually JSON.
5. Your code parses the response and handles failure explicitly.

${fence("javascript", `
async function getRepo(owner, name) {
  const res = await fetch("https://api.github.com/repos/" + owner + "/" + name, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!res.ok) throw new Error("Request failed: " + res.status);

  const repo = await res.json();
  return { name: repo.name, stars: repo.stargazers_count };
}
`)}

### Status codes worth knowing

| Code | Meaning | Your code should… |
| --- | --- | --- |
| \`200\` | OK | Parse the body |
| \`201\` | Created | Read the new resource |
| \`400\` | Bad request | Fix the payload; don't retry blindly |
| \`401 / 403\` | Not authenticated / not allowed | Re-authenticate or stop |
| \`404\` | Not found | Show an empty state |
| \`429\` | Rate limited | Back off, then retry |

### Why APIs feel hard at first

Because three separate things are happening: network transport, an agreed data format, and a shared understanding of meaning. Debugging is easier when you check them in that order — did the request leave, what came back, and what did it mean?

Latency adds up across chained calls:

$$T_{total} = \\sum_{i=1}^{n} (T_{network_i} + T_{server_i})$$

That is why APIs are often batched or cached.

### Practical application

Open your browser's Network tab, call a public API, and read the request headers before you look at the JSON. The request tells the story. The same cycle applies in ${label[lang]} — only the client library changes.

*Demo explanation — no model is connected. Ask a follow-up to see how the workspace continues a conversation.*
`
  );
}

/* ----------------------------------- code --------------------------------- */

function code(lang: AiLanguage) {
  return (
    NOTICE +
    `## A small, complete program

Here is a word-frequency counter — small enough to read in a minute, complete enough to run.

${fence(f(lang), pick(lang, {
  python: `
from collections import Counter

def top_words(text: str, limit: int = 3) -> list[tuple[str, int]]:
    words = (w.strip(".,!?;:").lower() for w in text.split())
    counts = Counter(w for w in words if w)
    return counts.most_common(limit)

if __name__ == "__main__":
    sample = "Code race race build test build build"
    for word, count in top_words(sample):
        print(f"{word}: {count}")
`,
  javascript: `
function topWords(text, limit = 3) {
  const counts = new Map();

  for (const raw of text.split(/\\s+/)) {
    const word = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "").toLowerCase();
    if (!word) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

console.log(topWords("Code race race build test build build"));
`,
  cpp: `
#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

std::vector<std::pair<std::string, int>> top_words(const std::string& text, std::size_t limit = 3) {
    std::map<std::string, int> counts;
    std::istringstream stream(text);
    std::string word;

    while (stream >> word) {
        ++counts[word];
    }

    std::vector<std::pair<std::string, int>> ranked(counts.begin(), counts.end());
    std::sort(ranked.begin(), ranked.end(),
              [](const auto& a, const auto& b) { return a.second > b.second; });

    if (ranked.size() > limit) ranked.resize(limit);
    return ranked;
}

int main() {
    for (const auto& [word, count] : top_words("code race race build test build build")) {
        std::cout << word << ": " << count << "\\n";
    }
}
`,
}))}

### How it works

1. Normalise each word so \`Race\` and \`race,\` are counted together.
2. Accumulate counts in a hash map.
3. Sort by count, then take the top \`limit\` entries.

### Complexity

| Step | Cost |
| --- | --- |
| Tokenise | $O(n)$ |
| Count | $O(n)$ expected |
| Sort results | $O(k \\log k)$ over distinct words |

### Next step

Ask me to turn this into a CLI that reads a file path, or to write tests for the empty-string case.

> Code execution is not connected, so this sample has not been run. Use **Download** above to take it into your editor.
`
  );
}

/* -------------------------------- challenge ------------------------------- */

function challenge(lang: AiLanguage) {
  return (
    NOTICE +
    `## Challenge guide: Two Sum

**Statement.** Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one solution exists and you may not use the same element twice.

### Clarify before you code

- Are the numbers sorted? (You cannot assume so.)
- Can numbers be negative? (Yes — so sliding windows on sorted data are not the first move.)
- Do you need to return indices or values? (Indices; ties don't matter.)

### A plan, not a solution

1. Write down the brute-force idea and its cost. Say it out loud: $O(n^2)$ time, $O(1)$ space.
2. Ask what you are repeatedly searching for. For each number \`x\` you need \`target - x\`.
3. Choose a structure that can answer "have I already seen the complement?" in near-constant time.
4. Decide what to store as you scan, and which check comes first.

### Hint ladder

- **Hint 1:** One pass is enough if you remember what came before.
- **Hint 2:** A hash map keyed by value, storing the index, makes the complement lookup $O(1)$ expected.
- **Hint 3:** Check for the complement *before* inserting the current number so an element cannot pair with itself.

### Starter code

${fence(f(lang), pick(lang, {
  python: `
def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for index, value in enumerate(nums):
        # TODO: check for the complement, then store this value
        pass
    return []
`,
  javascript: `
function twoSum(nums, target) {
  const seen = new Map();

  for (let i = 0; i < nums.length; i++) {
    // TODO: check for the complement, then store this value
  }

  return [];
}
`,
  cpp: `
std::vector<int> two_sum(const std::vector<int>& nums, int target) {
    std::unordered_map<int, int> seen;

    for (int i = 0; i < static_cast<int>(nums.size()); ++i) {
        // TODO: check for the complement, then store this value
    }

    return {};
}
`,
}))}

### Dry run on paper

| Step | Value | Complement needed | Map before check |
| --- | --- | --- | --- |
| 0 | 2 | 7 | \`{}\` |
| 1 | 7 | 2 | \`{2: 0}\` → match |

### What strong answers include

- The complexity of the final approach, not just the brute force.
- A note on duplicates and on negative numbers.
- A test where the answer is the last two elements.

Attempt it first. Reply with your code or your reasoning and I'll review it rather than hand you the answer.

*Demo challenge guide — no model is connected.*
`
  );
}

/* ----------------------------------- auto --------------------------------- */

function auto(prompt: string, lang: AiLanguage) {
  const p = prompt.toLowerCase();
  const quoted = prompt.replace(/[`\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

  if (/(error|bug|fix|crash|exception|traceback|undefined|null)/.test(p)) return debug(lang);
  if (/(review|improve|refactor|quality|security|audit)/.test(p)) return review(lang);
  if (/(teach|learn|lesson|beginner|explain.*from|understand)/.test(p)) return learn(lang);
  if (/(challenge|algorithm|leetcode|interview|problem)/.test(p)) return challenge(lang);
  if (/(build|create|write.*code|implement|app|program)/.test(p)) return code(lang);

  return (
    NOTICE +
    `## Let's take this one step at a time

You asked:

> ${quoted || "a question about programming"}

Since no model is connected, I can show you how CODE RACE AI structures an answer rather than invent one. A good technical explanation usually has four parts:

1. **The short answer** — one or two sentences you could repeat to a teammate.
2. **The mechanism** — what actually happens, step by step.
3. **A worked example** — small enough to reason about fully.
4. **The boundaries** — when the rule breaks, and what to do then.

### The core idea

Most programming questions reduce to one of these: *what is the data, what changes it, and what guarantees do I have afterwards?* State those three and the code usually follows.

${fence("javascript", `
// A tiny contract: given input, produce output, and fail loudly.
function parseLimit(value, fallback = 20) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}
`)}

| Input | Output | Why |
| --- | --- | --- |
| \`"25"\` | \`25\` | Valid integer string |
| \`"abc"\` | \`20\` | Unparseable → fallback |
| \`"900"\` | \`100\` | Clamped to a safe maximum |

### Try this

Turn the question into a test case first. If you can describe the input and the expected output precisely, the implementation is usually mechanical.

*Demo answer — connect an AI model in preferences for a real response tailored to your question.*
`
  );
}

/** Choose a demonstration reply for the active tool and language. */
export function buildDemoReply(tool: ToolId, lang: AiLanguage, prompt: string): string {
  switch (tool) {
    case "debug":
      return debug(lang);
    case "review":
      return review(lang);
    case "learn":
      return learn(lang);
    case "explain":
      return explain(lang);
    case "code":
      return code(lang);
    case "challenge":
      return challenge(lang);
    default:
      return auto(prompt, lang);
  }
}

export const demoLanguageLabel = (lang: AiLanguage) => label[lang];
