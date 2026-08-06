# Demo recording

`docs/demo.gif` is recorded against a **fictional local Coolify instance**
(`fake-coolify.mjs`), never a real one — no real infrastructure, hostnames, or
credentials appear in it. The MCP server itself is the real build, so the tool
calls and their output are genuine.

To re-record after changing the tools:

```bash
npm run build
node demo/fake-coolify.mjs &            # fictional API on :7799
asciinema rec demo.cast --overwrite --window-size 118x28 -c "node demo/demo.mjs"
agg --theme monokai --font-size 15 --idle-time-limit 2 demo.cast docs/demo.gif
kill %1
```

Requires `asciinema` and `agg` (`brew install asciinema agg`).
