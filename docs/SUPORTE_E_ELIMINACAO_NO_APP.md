# NODJUNTA-PAY: suporte e eliminação de conta no app

## Suporte
- **Onde:** Mais, Ajuda, Falar com o suporte.
- **Contactos:** +245 956 191 968 e +245 956 656 700, com botão para ligar. Vêm de `GET /public/support`.
  Se a API não responder, a app mostra os mesmos dois números, que tem de reserva.
- **Pedidos:** categoria, assunto e mensagem. No máximo 5 abertos de cada vez.
  Quem responde aparece sempre como "Suporte", nunca com o nome de um administrador.
- **Estados:** aguarda o suporte, o suporte respondeu, resolvido, fechado. Responder a um pedido resolvido reabre-o.
  Um pedido fechado já não aceita mensagens.
- **Avisos no ecrã:** nunca escrever o PIN, códigos SMS nem números de documentos.
- **Criar um pedido não é idempotente.** Com a ligação em dúvida a app manda verificar a lista antes de repetir.

## Eliminar conta
- **Onde:** Mais, Segurança, Eliminar conta.
- **Bloqueios** (a app mostra-os antes do formulário): saldo na carteira, depósitos ou levantamentos pendentes,
  conta bloqueada pelo suporte, conta de administração.
- **Para eliminar:** escrever ELIMINAR, o PIN (se existir) e ter entrado por SMS há menos de 10 minutos.
- **Depois:** a sessão termina. O número fica livre para uma conta nova.

### O que o sistema faz hoje
Remove o nome, o número, o email e os dispositivos, apaga o PIN e as notificações, fecha as carteiras,
anonimiza e suspende o negócio, fecha os pedidos de suporte e revoga as sessões.
Mantém o livro-razão, as transações, os recibos, as mensagens de suporte e a auditoria.

### O que NÃO está resolvido (decisão sua, com um advogado)
- **Prazo de conservação dos documentos de KYC.** Não são apagados automaticamente. Corra `npm run purge-kyc -- DIAS`
  só depois de decidir o prazo.
- **Texto do ecrã e política de privacidade.** O ecrã descreve o que o sistema faz; a redação final tem de ser revista
  por um advogado e coincidir com a política de privacidade publicada.
- **Dados que ficam:** mensagens de suporte e recibos são imutáveis. Se a pessoa escreveu dados pessoais numa mensagem,
  ficam guardados. Os recibos de outras pessoas mantêm o nome que lhes foi mostrado.
- **Pedido de eliminação fora da app.** A Google Play exige também um endereço web onde se peça a eliminação da conta.
  Isso ainda não existe.

## Lista de testes no telemóvel
1. Mais, Falar com o suporte: aparecem os dois números. Tocar num abre o marcador. Com a API desligada, os números aparecem na mesma.
2. Novo pedido sem escolher a categoria: aparece "Escolha o assunto." Preencher e enviar: abre a conversa.
3. No painel (ou por API), responder como suporte. Na app, o pedido passa a "O suporte respondeu", e chega uma notificação.
4. Responder na app: o pedido volta a "Aguarda o suporte". Fechar o pedido: o campo de mensagem desaparece.
5. Abrir 5 pedidos e tentar o sexto: aparece a mensagem do limite.
6. Eliminar conta com saldo: a app mostra "Ainda tem saldo" e o botão "Levantar o saldo". Com um pedido pendente: o botão para os pedidos.
7. Com a conta livre: escrever ELIMINAR, o PIN, e confirmar. Com um login antigo: a app explica que é preciso entrar de novo.
8. Depois de eliminar, tentar entrar com o mesmo número: deve criar uma conta nova e vazia.
