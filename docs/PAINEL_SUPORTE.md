# NODJUNTA-PAY: o suporte no painel

## Quem vê o quê
- **Suporte, revisor e administrador** veem o separador "Suporte" e podem responder. O painel esconde o separador a quem não tem `support:read`,
  mas quem decide é sempre a API.

## A fila
- Por omissão mostra os pedidos que **aguardam resposta**, do mais antigo para o mais recente, com o tempo de espera.
- Filtros: aguardam resposta, aguardam o cliente, resolvidos, fechados, todos.
- Com o filtro "Aguardam resposta" aparece quantos são. Não há contador no Resumo (o endpoint do Resumo não inclui o suporte).

## Atender um pedido
1. **Abrir:** a conversa abre por baixo da lista. **Cada abertura fica na auditoria**, antes de o conteúdo aparecer.
2. **Responder:** escreva a resposta (até 2000 caracteres). O cliente recebe uma notificação.
   A resposta aparece ao cliente como "Suporte", sem o seu nome.
3. **Resolver:** marque "Marcar como resolvido" ao responder, ou use o botão à parte.
   Se o cliente voltar a escrever, o pedido reabre sozinho.
4. **Fechar:** pede confirmação. O cliente deixa de poder responder e tem de abrir um pedido novo.

## Regras
- **Nunca peça o PIN nem o código SMS.** O app diz o mesmo ao cliente.
- **Nunca escreva dados de documentos** numa resposta.
- **Não trata os seus próprios pedidos:** se a sua conta tiver aberto o pedido, o painel avisa e a API recusa.
- Se o cliente perdeu o número ou o cartão SIM, não o resolva por aqui: o processo é a **troca de número**,
  com verificação de identidade fora da app e duas pessoas da equipa (separador a chegar num lote seguinte).

## Lista de testes
1. Com uma conta `support` (com MFA): o separador "Suporte" aparece. Com uma conta sem `support:read`: não aparece.
2. No app, abrir um pedido de suporte. No painel, aparece em "Aguardam resposta" com o tempo de espera.
3. Abrir o pedido: aparece o nome e o telemóvel do cliente. Em Auditoria (administrador), há um registo `ADMIN_SUPPORT_TICKET_VIEW`.
4. Responder sem marcar "resolvido": o pedido passa a "Aguarda o cliente", e o cliente recebe a notificação.
5. Responder marcando "resolvido": passa a "Resolvido". No app, responder reabre-o.
6. Fechar o pedido: pede confirmação, e deixa de mostrar o formulário de resposta.
7. Abrir um pedido da própria conta: aparece o aviso e não há formulário.
