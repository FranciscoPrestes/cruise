---
name: pickup
description: Retoma a sessão anterior a partir do último handoff gravado com /handoff (Claude Code, Codex, Cursor, Gemini, OpenCode...). Use logo depois de limpar a sessão ou abrir uma nova, quando pedirem "pickup", "retoma de onde parou", "continua o handoff" ou "onde paramos na outra sessão".
---

# Pickup

Retoma o trabalho exatamente de onde a sessão anterior parou.

## Como fazer

1. Se a sessão começou com um handoff do ai-memory no contexto, use esse handoff.
2. Se não, leia o arquivo mais recente em `~/.local/state/handoffs/<slug-da-pasta>/`. Se não houver nenhum, diga isso e pare.
3. Confira se a pasta e a branch batem com as do handoff. Se não baterem, avise antes de seguir.
4. Mostre ao usuário em até 5 linhas: objetivo, o que já foi feito, o próximo passo e as decisões pendentes. Depois execute o passo 1 de "Próximos passos". Ignore "Outras pendências", a não ser que o usuário peça.
