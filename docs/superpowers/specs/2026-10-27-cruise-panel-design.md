# Cruise: painel compacto de situação

## Objetivo e escopo

Permitir que o usuário entenda o estado do trabalho na sessão pelo painel `/cruise`: Git, handoff, agentes e tarefas, modelo e esforço, e tempos de atividade. A faixa acima do prompt continua com uma linha e sem as novas informações. Preservar as alterações locais existentes do painel e do handoff.

## Abordagens

- Painel compacto com detalhes expansíveis: resumo imediato e detalhes sob demanda; escolhido pelo usuário para manter a leitura rápida.
- Painel completo: todos os detalhes imediatamente; reduziria interações, mas poderia ficar longo com várias tarefas.

## Comportamento

- **Workspace e Git:** manter diretório, branch e tipo de checkout. Acrescentar totais de arquivos modificados, novos e preparados para commit. Em detalhes, mostrar caminhos e estado por arquivo. Diferenciar alterações preparadas e não preparadas no mesmo arquivo; tratar repositório ausente, erro e Git indisponível sem declarar erroneamente que está limpo.
- **Handoff:** identificar explicitamente como último handoff da pasta, não necessariamente da sessão; mostrar data e estado encontrado e as etapas reais do relay. Em detalhes, mostrar caminho absoluto e objetivo quando disponível. Distinguir arquivo encontrado, conversa limpa e pickup iniciado; não afirmar conclusão da retomada sem evidência. Se não houver registro, informar isso.
- **Agentes e tarefas:** resumir quantidades ativas por tipo; em detalhes, exibir descrição e estado que o harness fornecer, ou identificador/tipo quando não houver descrição. Não inferir objetivos, nem tratar falha de consulta como ausência de agentes.
- **Modelo e esforço:** mostrar o modelo atual quando o harness o fornecer, ao lado do esforço e da razão de pausa existente; informar quando o dado não estiver disponível. Não supor que o modelo do juiz seja o modelo da conversa.
- **Tempo:** mostrar tempo desde o início da sessão e desde o último evento de atividade observado, com rótulos claros. Se não houver evento ou fonte confiável, informar indisponibilidade. Não diagnosticar travamento a partir do tempo decorrido.
- **Interação:** detalhes fechados por padrão e acessíveis por teclado, com opção de fechar. O painel atual tem altura limitada: permitir rolagem ou paginação para acessar todos os detalhes, sem cortá-los silenciosamente. Manter alternativa textual para ambientes sem interface visual.

## Fontes e limites

Usar as APIs e padrões existentes do Cruise; `session.model` fornece o modelo, `session.usage` expõe `startedAt` e `agent.list` fornece descrição, tipo e status dos agentes, enquanto tarefas em segundo plano podem ter dados mais limitados. Consultar Git localmente sem alterar arquivos. Dados de handoff vêm do arquivo local e dos estados observados do relay, não de suposições. Não incluir conteúdo de arquivos, segredos ou alterações no histórico de conversa. Se uma fonte falhar, mostrar estado desconhecido e manter o painel operacional. Não adicionar dependências.

## Validação

Testar Git limpo e sujo, worktree e fora de repositório; handoff ausente e estágios sem conclusão inventada; agentes e falha de consulta; modelo disponível e indisponível; atividade conhecida e desconhecida; expansão, teclado e larguras pequenas. Executar a suíte e validar o plugin; verificar o painel real no Claude Code quando disponível, relatando qualquer limite dessa verificação. Não publicar no GitHub nem criar release como parte deste desenho.
