# Cache probe

A throwaway plugin that answers one question: **does changing the reasoning effort between requests rewrite the prompt cache on your Claude Code and model?** It alternates `low` and `high` on every main-loop request and logs the cache reads and writes of each one to `/tmp/cache-probe.log`.

```bash
mkdir -p /tmp/probe/hooks /tmp/probe/.claude-plugin
cp plugin.json /tmp/probe/.claude-plugin/ && cp register.ts /tmp/probe/hooks/
echo '{ "modules": ["./register.ts"] }' > /tmp/probe/hooks/hooks.json
cd "$(mktemp -d)" && PROBE_MODE=alternate claude -p --plugin-dir /tmp/probe --model claude-sonnet-5-5 --allowedTools Bash \
  "Run these five shell commands one at a time, each in its own separate Bash tool call, waiting for each result before making the next call: echo a ; echo b ; echo c ; echo d ; echo e. Then reply with just DONE."
cat /tmp/cache-probe.log
```

Healthy: `cache_read` grows request after request and `cache_write` stays small (tens to a few hundred tokens). A cache that does not survive shows up as a request with a large `cache_write` and `cache_read` near zero. Delete `/tmp/probe` afterwards.
