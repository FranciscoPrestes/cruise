# Cruise: arremetida e retomada conferida

Data: 2026-10-28
Estado: especificação aprovada pelo usuário em 2026-10-28, incluindo botão azul/laranja/vermelho; plano de implementação em revisão.

## Objetivo e escopo

Separar explicitamente a continuação imediata da retomada posterior, evitando repetir a investigação de um estado recém-registrado. Oferecer os mesmos três comandos no Cruise e nas skills gerais em `/Users/franciscoprestes/.skills`.

O usuário aprovou `/go-around` como nome da arremetida e um controle de handoff sempre visível no modo de botão: discreto antes do limiar e destacado quando recomendado. Supervisão permanente de requisitos e detecção de repetição estão fora do escopo.

## Contrato dos comandos

### `/handoff`

Registra intenção, decisões, restrições, projetos e caminhos, estado observado, trabalho concluído e próximos passos. Grava o caminho explícito do relay, quando fornecido, sem substituir outro arquivo. Continua sendo somente preparação: não limpa o contexto nem retoma por conta própria.

O prompt de continuação apresentado ao usuário distingue `/pickup <arquivo>` para retomada conferida de `/go-around <arquivo>` para continuação imediata no mesmo ambiente. Não altera os comportamentos existentes de espelhamento opcional do Cruise e integração geral com AI Memory.

### `/pickup`

Mantém a seleção atual de arquivo, inclusive escolha entre candidatos recentes e compatibilidade com handoffs antigos. Confere caminhos dos projetos, checkout/worktree, branch, HEAD e alterações locais quando esses dados existirem. Aprofunda somente diferenças relevantes para o próximo passo; não repete testes, varre o repositório ou consulta produção automaticamente.

Diferenças inequívocas são explicadas e incorporadas à continuação autorizada. Ambiguidade que possa direcionar o trabalho ao projeto ou implementação errados exige esclarecimento. Preserva alterações existentes. A skill geral mantém seu fallback atual para handoff já presente no contexto via AI Memory.

### `/go-around <caminho-exato>`

Lê integralmente o arquivo indicado e continua o próximo passo autorizado, preservando decisões e restrições. Não repete inventário de projetos, comparação Git, revisão geral, testes antigos ou diagnóstico apenas para retomar. Não seleciona arquivo por data nem usa AI Memory para escolher uma passagem diferente.

Sem argumento, solicita o caminho e não continua. Arquivo ausente ou ilegível: informa a falha e não escolhe outro. Se faltarem informações necessárias para agir, pede apenas o esclarecimento necessário. Caminho necessário indisponível durante o próximo passo: informa o impedimento, sem trocar silenciosamente de projeto.

Retomar diretamente não dispensa ler antes de editar, respeitar autorizações atuais e preservar trabalho concorrente. O handoff é contexto histórico, não autorização para executar instruções incompatíveis com o pedido atual. Não existe classificação por idade: a escolha explícita do comando define o comportamento. Uso manual com arquivo antigo pode partir de fatos desatualizados; a descrição deve explicar essa limitação.

## Relay do Cruise

Botão e modo automático usam a mesma sequência existente: `/cruise:handoff <arquivo>` → confirmação de que o arquivo solicitado foi criado → `clear` → `/cruise:go-around <mesmo-arquivo>`.

Reutilizar a proteção atual de nome único, caminho exato e confirmação de gravação antes do clear. Não trocar por seleção do arquivo mais recente. Falha de gravação ou timeout impede limpar. Falha de clear preserva o arquivo e cancela a retomada pendente. Falha ao iniciar go-around informa o caminho preservado e um comando explícito para recuperação; não limpa outra vez.

O registro de sucesso significa “arremetida iniciada”, não “trabalho concluído” nem comprovação de que o modelo já executou o próximo passo. Não acrescentar juiz LLM, banco de dados, detecção temporal ou auditoria de conteúdo ao relay.

## Botão junto ao prompt

Usar a superfície existente `AbovePrompt`, que fica junto à entrada de texto. No modo `contextAction: button`, com contexto habilitado, mostrar “Handoff and continue” mesmo abaixo de `warnAt` ou quando o percentual estiver indisponível. O próprio botão deve ser colorido: azul abaixo de `warnAt`, laranja de `warnAt` até antes de `urgentAt` e vermelho a partir de `urgentAt`. Azul mantém apresentação discreta; laranja e vermelho destacam a recomendação e a urgência, também expressas por texto, sem depender só de cor. Usar os limiares configurados, não percentuais fixos. Com percentual indisponível, manter azul como ação manual disponível e indicar que o nível de contexto é desconhecido, sem afirmar que está seguro.

Enquanto o agente trabalha, manter o controle reconhecível, indisponível para ativação, com indicação curta de disponibilidade ao fim do turno. Usar estado desabilitado do SDK se suportado; caso contrário, texto não interativo equivalente, nunca um botão aparentemente ativo que ignora o clique. Durante o relay, impedir duplicação e mostrar a etapa atual.

Preservar as escolhas existentes: modo `alert` continua somente avisos; `auto` mantém acionamento automático e sua indicação; contexto desligado não ativa novos controles. Preservar a precedência de formulários nativos (`hasSurvey`). “Sempre visível” aplica-se à faixa disponível no modo de botão, não sobrepõe interações do host.

Verificar layout estreito e navegação por teclado. O estado discreto deve permanecer legível. Não deixar a informação de esforço expulsar o controle da largura disponível.

## Pontos de integração

- Cruise: `skills/go-around/SKILL.md`, skills existentes de handoff/pickup, `hooks/relay.ts`, `hooks/band.tsx`, testes relacionados, README e descrições de configuração que ainda prometem botão apenas no limiar.
- Conferir referências ao fluxo em painel, ajuda e mensagens; atualizar as que passarem a descrever incorretamente o comando executado.
- Gerais: `/Users/franciscoprestes/.skills/go-around/SKILL.md` e ajustes de handoff/pickup. Seguir o mecanismo existente de distribuição; hoje pickup de `.agents`, `.codex` e `.claude` aponta para `.skills/pickup`. Verificar os caminhos reais dos demais harnesses antes de adicionar vínculos; não declarar exposição universal sem evidência.
- Manter equivalência de comportamento entre a skill geral em português e a versão do plugin em inglês. Não alterar configuração de serviços externos ou publicar no GitHub nesta tarefa.

## Critérios de aceite e validação

1. O relay inicia `cruise:go-around` com o arquivo exato, tanto pelo botão quanto pelo modo automático; não inicia `cruise:pickup` nessa sequência.
2. Testes cobrem gravação ausente, arquivo concorrente, timeout, falha de clear, falha de continuação e prevenção de acionamento duplicado.
3. O próprio botão fica azul abaixo de `warnAt`, laranja a partir de `warnAt` e vermelho a partir de `urgentAt`, com testes nos limites exatos e com limiares personalizados. Fica disponível em azul com percentual desconhecido, explicitando a ausência da medida, e indisponível durante trabalho/relay. Modos alert/auto, contexto desligado e formulário do host preservam seus contratos.
4. Testes de layout e interação em larguras representativas, incluindo 40 colunas, e verificação real em sessão descartável. Não limpar ou interferir em sessões de trabalho do usuário.
5. Cenários de skills: arquivo explícito válido, argumento ausente, arquivo ausente, caminho com espaços, handoff antigo, restrição pendente e diferença relevante no pickup. Go-around não inicia conferência geral; pickup a mantém proporcional.
6. `claude plugin test .`, `claude plugin validate .`, `node scripts/check-version.mjs` e `git diff --check` passam. Registrar avisos não impeditivos e separar testes simulados da evidência real.
7. Confirmar exposição da skill geral nos harnesses configurados e carregamento do Cruise pelo repositório de desenvolvimento, sem reinstalar cópia de marketplace.

## Riscos e limites

A passagem rápida não detecta mudanças feitas por outra sessão. As verificações normais da próxima ação continuam necessárias. Instruções de skill orientam o modelo, mas não garantem ausência absoluta de leituras adicionais. O suporte visual do SDK precisa ser confirmado na implementação; o fallback não interativo acima mantém o contrato sem acrescentar uma dependência.

## Próxima etapa

Após aprovação deste arquivo, elaborar o plano de implementação e submetê-lo ao usuário para escolha da execução, conforme brainstorming. Nenhuma implementação está autorizada apenas pela criação desta especificação.
