# NODJUNTA-PAY: inventário de ficheiros

Legenda: **Escrito** = o código foi entregue. **Testado** = foi executado com resultado verificado.
**Terceiros** = depende de credenciais, serviços externos ou aprovação regulatória.

**Testado: nada ainda.** Nenhum código foi executado por quem o escreveu (sem rede no ambiente de
desenvolvimento). A primeira corrida no Replit é que confirma tipos, testes e fluxos.

## Entregue (437 ficheiros)

| Ficheiros | Conteúdo | Escrito | Testado | Terceiros |
|---|---|---|---|---|
| 1 a 112 | API base: Fastify e TypeScript, ledger de partidas dobradas, carteira, transferências, pagamentos, depósitos e levantamentos (sandbox), limites e tarifas, KYC, webhooks assinados, reconciliação, migrations 1 a 12, Render | sim | não | provedor financeiro real |
| 113 a 191 | App Expo: login por SMS, início, extrato, enviar, pagar por QR, depósitos, levantamentos, limites, KYC, comerciante, guias de publicação | sim | não | SMS para +245, contas Apple e Google |
| 192 a 204 | API de administração (papéis, KYC, comerciantes, utilizadores, auditoria), migration 13 | sim | não | |
| 205 a 242 | Painel web: login, resumo, KYC, comerciantes, utilizadores, auditoria | sim | não | alojamento no Render |
| 243 a 283 | Design system: tokens, contraste, 29 ícones, logótipo, ilustrações, componentes, catálogo | sim | não | aprovação do design e imagem de referência de Cabral |
| 284 a 310 | PIN de 6 dígitos (hash com pimenta, 5 tentativas e bloqueio), contactos de suporte, configuração | sim | não | |
| 311 a 330 | Notificações dentro da app e envio de push (Expo) | sim | não | credenciais FCM e APNs |
| 331 a 339 | Recibos imutáveis com número único | sim | não | |
| 340 a 356 | Suporte: pedidos e mensagens, fila e respostas na administração | sim | não | |
| 357 a 371 | Relatórios (resumo, diário, comerciantes) e exportação em CSV | sim | não | |
| 372 a 386 | Eliminação de conta (anonimização) e limpeza de documentos de KYC | sim | não | prazo de conservação definido por advogado |
| 387 a 397 | Troca de número de telefone (dois administradores) | sim | não | |
| 398 a 411 | Segundo fator (MFA) obrigatório para administradores | sim | não | ativação do MFA no Supabase |
| 412 a 427 | Antifraude (velocidade, pausa nos levantamentos, montante elevado) e alertas | sim | não | limiares definidos com a conformidade |
| 428 a 437 | Documentação OpenAPI (62 rotas), testes de paridade e guia da API | sim | não | |

**Bloco B (backend): fechado.** 154 ficheiros novos, de 284 a 437, e 13 migrations novas (14 a 25).
Testes da API esperados: **742**. Testes SQL: um ficheiro por migration, em `supabase/tests/`.

## Por entregar (estimativa)

| Bloco | Conteúdo | Ficheiros |
|---|---|---|
| M | App: nova marca nas telas existentes, splash, boas-vindas, registo, PIN (definir, usar, trocar, recuperar), receber dinheiro, comprovativos, notificações e push, suporte, segurança, perfil, eliminação de conta, idiomas | cerca de 70 |
| A | Painel: nova marca, ecrã do segundo fator, suporte, relatórios, trocas de número, alertas de fraude, operações | cerca de 35 |
| Q | Qualidade: CI no GitHub, testes de segurança, fluxos de ponta a ponta | cerca de 20 |
| P | Publicação: Supabase, Render, EAS, Google Play, App Store | cerca de 10 |

## Fora do código (dependem de si)
- Provedor financeiro real: contrato e documentação oficial. Hoje só existe o provedor de teste (sandbox)
- Aprovação regulatória (BCEAO e autoridades da Guiné-Bissau)
- Provedor de SMS com cobertura para +245
- Contas Apple Developer e Google Play, credenciais de push (FCM e APNs)
- Tradução para crioulo validada por um falante nativo
- Política de privacidade e termos, revistos por um advogado
- Prazo de conservação dos documentos de KYC, decidido com um advogado
- Limiares do antifraude, limites e tarifas, definidos com a conformidade
- Imagem de referência da estátua de Amílcar Cabral e aprovação final do design
- Ativar o MFA no Supabase e ter pelo menos duas contas de administração com autenticador
