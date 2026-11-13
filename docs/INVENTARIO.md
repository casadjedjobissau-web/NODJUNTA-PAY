# NODJUNTA-PAY: inventário de ficheiros

Legenda: **Escrito** = o código foi entregue. **Testado** = foi executado com resultado verificado.
**Terceiros** = depende de credenciais, serviços externos ou aprovação regulatória.

**Testado: nada ainda.** Nenhum código foi executado por quem o escreveu (sem rede no ambiente de
desenvolvimento). A primeira corrida no Replit é que confirma tipos, testes e fluxos.

## Entregue

| Ficheiros | Conteúdo | Escrito | Testado | Terceiros |
|---|---|---|---|---|
| 1 a 112 | API (Fastify, TypeScript), ledger, carteira, transferências, pagamentos, fundos (sandbox), limites, KYC, webhooks, reconciliação, migrations 1 a 12, Render | sim | não | provedor financeiro real |
| 113 a 191 | App Expo (login OTP, início, extrato, enviar, pagar por QR, depósitos, levantamentos, limites, KYC, comerciante), guias de publicação | sim | não | SMS para +245, contas Apple e Google |
| 192 a 204 | API de administração (papéis, KYC, comerciantes, utilizadores, auditoria), migration 13 | sim | não | MFA a ativar no Supabase |
| 205 a 242 | Painel web (login, resumo, KYC, comerciantes, utilizadores, auditoria) | sim | não | alojamento no Render |
| 243 a 252 | Bloco D, lote D1: tokens de design, contraste, motivos, ponte do tema, logótipo, botão, inventário | sim | não | revisão do logótipo pelo cliente |

## Bloco D: design system (em curso)

| Ficheiros | Conteúdo |
|---|---|
| 253 a 262 (D2) | Componentes base: campo de texto, ecrã, cartão, etiqueta, lista, avatar, cabeçalho de secção, resultado, movimento, esqueleto de carregamento |
| 263 a 272 (D3) | Ilustrações SVG (mangal, Bijagós, Fortaleza de São José da Amura, apresentação institucional), ícones, ecrã-catálogo, guia de marca `docs/DESIGN.md`, configuração do ícone e do ecrã de arranque |

Aprovação do design antes de iniciar o Bloco M.

## Por entregar (estimativa)

| Bloco | Conteúdo | Ficheiros |
|---|---|---|
| B | Backend novo: PIN, notificações, recibos, suporte, relatórios, troca de número, eliminação de conta, MFA do painel, OpenAPI | cerca de 55 |
| M | App: nova marca, splash, boas-vindas, registo, PIN, receber, comprovativos, notificações, suporte, segurança, perfil | cerca de 60 |
| A | Painel: nova marca, suporte, relatórios, operações, troca de número | cerca de 30 |
| Q | Qualidade: CI no GitHub, testes de segurança, fluxos de ponta a ponta | cerca de 20 |
| P | Publicação: Supabase, Render, EAS, Google Play, App Store | cerca de 10 |

## Fora do código (dependem de si)
- Provedor financeiro real: contrato e documentação oficial
- Aprovação regulatória (BCEAO e autoridades da Guiné-Bissau)
- Provedor de SMS com cobertura para +245
- Contas Apple Developer e Google Play, credenciais de push (FCM e APNs)
- Tradução para crioulo validada por um falante nativo
- Política de privacidade e termos, revistos por um advogado
