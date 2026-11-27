# NODJUNTA-PAY: inventário final de ficheiros

Legenda: **Escrito** = o código foi entregue. **Testado** = foi executado com resultado verificado.
**Terceiros** = depende de credenciais, serviços externos ou aprovação regulatória.

**Testado: nada.** Nenhum código foi executado por quem o escreveu (sem rede no ambiente de desenvolvimento).
A primeira execução no Replit e a integração contínua é que confirmam tipos, testes e fluxos.

## Entregue: 604 ficheiros

| Ficheiros | Conteúdo | Escrito | Testado | Terceiros |
|---|---|---|---|---|
| 1 a 112 | API base: ledger de partidas dobradas, carteira, transferências, pagamentos, depósitos e levantamentos (sandbox), limites e tarifas, KYC, webhooks assinados, reconciliação, migrations 1 a 12 | sim | não | provedor financeiro real |
| 113 a 191 | App Expo: login por SMS, início, extrato, enviar, pagar por QR, depósitos, levantamentos, limites, KYC, comerciante | sim | não | SMS para +245, contas Apple e Google |
| 192 a 242 | API de administração e painel web inicial | sim | não | |
| 243 a 283 | Design system: tokens, contraste, ícones, logótipo, ilustrações, componentes | sim | não | aprovação do design |
| 284 a 437 | Backend: PIN, notificações e push, recibos, suporte, relatórios, eliminação de conta, troca de número, MFA, antifraude, OpenAPI. 13 migrations novas | sim | não | ver `docs/DECISOES.md` |
| 438 a 533 | App: PIN, notificações, recibos, suporte, eliminação de conta, design novo, idiomas, bloqueio por biometria | sim | não | push (FCM e APNs), tradução para crioulo |
| 534 a 577 | Painel: segundo fator, nova marca, suporte, relatórios, trocas de número, fraude | sim | não | MFA ativo no Supabase |
| 578 a 595 | Qualidade: integração contínua, testes de segurança (API e SQL), fluxo de ponta a ponta | sim | não | |
| 596 a 604 | Publicação: Render, `app.json`, `eas.json`, teste da configuração, guias, checklist e decisões | sim | não | contas das lojas, provedor, regulador |

**Testes esperados:** API **790** (mais o fluxo de ponta a ponta, que corre à parte). App e painel: as contagens estão em cada lote.
Testes SQL: um ficheiro por migration, mais `security_smoke.sql`, em `supabase/tests/`.

## Estado de cada parte
- **Backend:** completo no âmbito combinado. Provedor financeiro real **não existe** (só sandbox).
- **App:** completo no âmbito combinado, com três ressalvas: só as boas-vindas usam o dicionário de idiomas; **receber dinheiro por QR pessoal não foi feito**; **a apresentação institucional com Amílcar Cabral não foi feita**.
- **Painel:** completo no âmbito combinado.
- **Qualidade e publicação:** escritas, nunca executadas.

## Guias (em `docs/`)
`API.md`, `openapi.yaml`, `openapi-admin.yaml`, `CI.md`, `E2E.md`, `SEGURANCA.md`, `PUBLICACAO.md`, `LOJAS.md`,
`CHECKLIST_PRODUCAO.md`, `DECISOES.md`, `ANTIFRAUDE.md`, `ADMIN_MFA.md`, `PIN_NO_APP.md`, `NOTIFICACOES.md`, `RECIBOS_NO_APP.md`,
`SUPORTE_E_ELIMINACAO_NO_APP.md`, `IDIOMAS_E_BLOQUEIO.md`, `PAINEL_SUPORTE.md`, `PAINEL_OPERACOES.md`.
