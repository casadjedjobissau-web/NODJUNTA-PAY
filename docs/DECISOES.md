# NODJUNTA-PAY: decisões que só o dono do projeto pode tomar

O código está escrito de ponta a ponta. O que impede um lançamento **não é código**. Por ordem de prioridade:

## A. Sem isto não há dinheiro real
1. **Modelo regulatório:** licença própria de moeda eletrónica, ou parceria com uma instituição já autorizada. Quem é a entidade legal.
2. **Provedor financeiro:** banco, operadora ou agregador, com contrato e a documentação oficial da API.
   Quando a tiver, envie-ma: a integração é um ficheiro novo (`FundingProvider`) mais a verificação do webhook oficial.
3. **Serviço de SMS** com cobertura para +245. Sem ele ninguém entra na app.
4. **Limites, tarifas e saldo máximo** aprovados pelo regulador ou pelo parceiro, e os **limiares do antifraude**.
5. **Textos legais** revistos por um advogado: termos de utilização, política de privacidade, ecrã de eliminar conta, recibos.
6. **Prazo de conservação dos documentos de KYC.** Com ele, agenda-se o `purge-kyc`.

## B. Sem isto não há lojas
7. Contas **Apple Developer** (organização) e **Google Play**, e a entidade que as titula.
8. **URL público** da política de privacidade e **URL de eliminação de conta** (este ainda não existe).
9. **Número de teste** com código fixo no Supabase, para os revisores entrarem.
10. **Identificador definitivo** da app (`com.nodjuntapay.app` é provisório e não muda depois de publicado) e o **nome** na loja.
11. Capturas de ecrã, descrições e a declaração de conformidade de exportação (declaração legal sua).

## C. Marca e produto
12. **Imagem de referência da estátua de Amílcar Cabral** e o texto da apresentação institucional (ou decidir não a ter).
13. **Aprovação** da paleta (verde `#16A765`, preto `#101820`, branco, azul `#1769D2`), do logótipo e das ilustrações.
14. **Tradução para crioulo** feita e validada por um falante nativo.
15. Confirmar os **dois números de suporte** (+245 956 191 968 e +245 956 656 700) e o horário.

## D. Operação
16. Quem revê KYC, comerciantes, suporte e alertas de fraude, e em que horário.
17. **Duas contas de administração** com autenticador, e um processo para quando alguém perder o telemóvel.
18. Plano de incidentes e de comunicação com o regulador.
19. Serviço de **alertas de erros** e de monitorização.
20. Teste de intrusão por especialistas independentes.

## E. Pedidos técnicos que me pode fazer a seguir
- Resolver os erros da **primeira execução** (veja abaixo como mos enviar).
- `Cache-Control: no-store` nas respostas com saldos.
- Receber dinheiro por **QR pessoal**.
- Limites também nos **depósitos** e **saldo máximo** da carteira.
- Endereço web para pedir a eliminação da conta.
- Passar todos os ecrãs ao dicionário de idiomas, quando houver tradução validada.
- Integrar o provedor financeiro, quando houver documentação.

## Como me enviar os resultados da primeira execução
Por esta ordem, parando no primeiro que falhar e colando-me **a mensagem de erro completa**:
1. `npm install` e depois `npm run typecheck:api` e `npm run test:api` (raiz)
2. `npm install` em `apps/admin`, depois `npm run typecheck` e `npm run test`
3. `npm install` em `apps/mobile`, depois `npm run typecheck` e `npm run test`
4. Migrations e testes SQL num projeto de testes (`bash scripts/run-sql-tests.sh`)
5. O fluxo de ponta a ponta (`npm run test:e2e`)
6. Push para o GitHub e o resultado da integração contínua
