"""The five reasoning efforts of Claude Code and what each one is for. Keep in step with hooks/effort-rules.ts."""
LEVELS = ["low", "medium", "high", "xhigh", "max"]
CRITERIA = {
    "low": "a simple, well-bounded request: a quick answer, a lookup, a one-line or single-file edit; nothing to verify",
    "medium": "well-specified work with clear steps: read a few files, change a function and its tests, explain a module",
    "high": "complex reasoning or hard coding: an unknown cause to debug, a design choice, a large refactor or review, a vague ask to explore, costly mistakes",
    "xhigh": "long-horizon agentic work: an investigation or build of 30 minutes or more across many files or systems",
    "max": "the deepest reasoning: a novel or research-level problem where depth of thought, not length, is the bottleneck; rare",
}
RANK = {level: i for i, level in enumerate(LEVELS)}


def quantile_pick(probs, tau):
    """The lowest level whose cumulative probability reaches tau (keep in step with quantilePick in hooks/effort-rules.ts).

    tau 0.5 is the median of the judge's belief; higher is more careful, because a level that is too low costs more than one
    that is too high."""
    total = 0.0
    for level in LEVELS:
        total += probs.get(level, 0.0)
        if total >= tau:
            return level
    return LEVELS[-1]


def summarize(rows, picks):
    """Exact, within one level, too low, too high, and the average level index of the picks against the labels."""
    n = len(rows)
    exact = near = low = high = 0
    for row, pick in zip(rows, picks):
        d = RANK[pick] - RANK[row["label"]]
        exact += d == 0
        near += abs(d) <= 1
        low += d < 0
        high += d > 0
    severe_low = sum(RANK[r["label"]] - RANK[p] >= 2 for r, p in zip(rows, picks))
    easy = [p for r, p in zip(rows, picks) if r["label"] == "low"]
    hard = [p for r, p in zip(rows, picks) if RANK[r["label"]] >= 2]
    calm = [p for r, p in zip(rows, picks) if RANK[r["label"]] <= 1]
    mean_pick = sum(RANK[p] for p in picks) / n
    mean_label = sum(RANK[r["label"]] for r in rows) / n
    return {"exact": exact / n, "within1": near / n, "too_low": low / n, "too_high": high / n, "mean_pick": mean_pick, "mean_label": mean_label,
            "severe_low": severe_low / n, "easy_found": sum(p == "low" for p in easy) / max(1, len(easy)),
            "hard_found": sum(RANK[p] >= 2 for p in hard) / max(1, len(hard)), "false_hard": sum(RANK[p] >= 2 for p in calm) / max(1, len(calm))}


def cost(rows, picks, under=3.0, over=1.0):
    """Mean cost per prompt: every level a pick is below the label costs `under` (quality risk), every level above costs `over` (tokens)."""
    return sum(under * max(0, RANK[r["label"]] - RANK[p]) + over * max(0, RANK[p] - RANK[r["label"]]) for r, p in zip(rows, picks)) / len(rows)


def line(name, s):
    return (f"  {name:<22} exact {100 * s['exact']:.0f}%  within 1 level {100 * s['within1']:.0f}%  too low {100 * s['too_low']:.0f}%  "
            f"too high {100 * s['too_high']:.0f}%  2+ levels too low {100 * s['severe_low']:.0f}%  easy found {100 * s['easy_found']:.0f}%  "
            f"hard found {100 * s['hard_found']:.0f}%  false alarms {100 * s['false_hard']:.0f}%  mean level {s['mean_pick']:.2f} (labels {s['mean_label']:.2f})")


# Made-up examples (none comes from anyone's sessions) that anchor the five levels in the Haiku judge's instructions.
# Keep in step with EXAMPLES in hooks/effort-rules.ts.
EXAMPLES = [
    ("low", "rename the variable foo to count in utils.ts"),
    ("low", "what does git rebase do?"),
    ("low", "muda a cor do botão de salvar para azul"),
    ("medium", "add a retry with backoff to the upload function and update its tests"),
    ("medium", "explain how the auth middleware works and where tokens are validated"),
    ("medium", "cria um endpoint para listar pedidos com paginação"),
    ("high", "the nightly export corrupts rows when two workers overlap: find the cause and fix it"),
    ("high", "review this whole repo for security problems and give me a prioritised list"),
    ("high", "migra o módulo de cobrança de REST para GraphQL sem quebrar os clientes"),
    ("xhigh", "design and build a multi-tenant permission system across the API, the web app and the mobile app, with a migration plan"),
    ("xhigh", "p99 latency doubled after last week's release across a dozen services and nobody knows why: investigate end to end"),
    ("max", "prove or refute that this lock-free queue is linearizable, then fix the implementation if it is not"),
    ("max", "port the entire compiler backend to a new intermediate representation while every existing test keeps passing"),
]
