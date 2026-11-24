# NODJUNTA-PAY: inventário de ficheiros

Legenda: **Escrito** = o código foi entregue. **Testado** = foi executado com resultado verificado.
**Terceiros** = depende de credenciais, serviços externos ou aprovação regulatória.

**Testado: nada ainda.** Nenhum código foi executado por quem o escreveu (sem rede no ambiente de
desenvolvimento). A primeira corrida no Replit é que confirma tipos, testes e fluxos.

## Entregue (533 ficheiros)

| Ficheiros | Conteúdo | Escrito | Testado | Terceiros |
|---|---|---|---|---|
| 1 a 112 | API base: ledger de partidas dobradas, carteira, transferências, pagamentos, depósitos e levantamentos (sandbox), limites e tarifas, KYC, webhooks assinados, reconciliação, migrations 1 a 12, Render | sim | não | provedor financeiro real |
| 113 a 191 | App Expo: login por SMS, início, extrato, enviar, pagar por QR, depósitos, levantamentos, limites, KYC, comerciante | sim | não | SMS para +245, contas Apple e Google |
| 192 a 242 | API de administração e painel web (login, resumo, KYC, comerciantes, utilizadores, auditoria) | sim | não | alojamento no Render |
| 243 a 283 | Design system: tokens, contraste, ícones, logótipo, ilustrações, componentes, catálogo | sim | não | aprovação do design e imagem de referência de Cabral |
| 284 a 437 | Backend do bloco B: PIN, notificações e push, recibos, suporte, relatórios, eliminação de conta, troca de número, MFA dos administradores, antifraude, OpenAPI (62 rotas). 13 migrations novas | sim | não | ver "Fora do código" |
| 438 a 469 | App: PIN (criar, usar em cada operação, alterar, recuperar), arranque e boas-vindas | sim | não | |
| 470 a 479 | App: notificações e registo do push | sim | não | projeto EAS, credenciais FCM e APNs |
| 480 a 493 | App: recibos (abrir pelo extrato e pelo resultado, partilhar em PDF e imagem) | sim | não | |
| 494 a 505 | App: suporte (pedidos e contactos) e eliminação de conta | sim | não | textos legais |
| 506 a 518 | App: telas antigas no design novo, abas com ícones | sim | não | |
| 519 a 533 | App: estrutura de idiomas e bloqueio por biometria | sim | não | tradução para crioulo |

**Bloco B (backend): fechado.** Testes da API esperados: **742**. Testes SQL: um ficheiro por migration, em `supabase/tests/`.

**Bloco M (app): fechado, com três ressalvas:**
1. Só o ecrã de boas-vindas usa o dicionário de idiomas. Os outros têm o português escrito diretamente.
2. **Não feito:** receber dinheiro por QR pessoal (precisa de uma alteração na API). Hoje recebe-se pelo número de telemóvel.
3. **Não feito:** apresentação institucional com a referência a Amílcar Cabral (falta a imagem de referência e um texto seu).

## Por entregar (estimativa)

| Bloco | Conteúdo | Ficheiros |
|---|---|---|
| A | Painel: nova marca, ecrã do segundo fator (MFA), suporte, relatórios, trocas de número, alertas de fraude, operações | cerca de 30 |
| Q | Qualidade: CI no GitHub, testes de segurança, fluxos de ponta a ponta | cerca de 16 |
| P | Publicação: Supabase, Render, EAS, Google Play, App Store | cerca de 6 |

## Fora do código (dependem de si)
- Provedor financeiro real: contrato e documentação oficial. Hoje só existe o provedor de teste (sandbox)
- Aprovação regulatória (BCEAO e autoridades da Guiné-Bissau)
- Provedor de SMS com cobertura para +245
- Contas Apple Developer e Google Play, projeto EAS, credenciais de push (FCM e APNs)
- Tradução para crioulo, feita e validada por um falante nativo (o app só oferece o idioma quando estiver completa)
- Política de privacidade e termos, revistos por um advogado. Os textos do ecrã de eliminar conta também
- Endereço web para pedir a eliminação da conta (exigido pela Google Play)
- Prazo de conservação dos documentos de KYC, decidido com um advogado
- Limiares do antifraude, limites e tarifas, definidos com a conformidade
- Imagem de referência da estátua de Amílcar Cabral e aprovação final do design
- Ativar o MFA no Supabase e ter pelo menos duas contas de administração com autenticador
- Ligar `PIN_ENFORCEMENT=on` e `ADMIN_MFA=on` na API (obrigatório em produção)
