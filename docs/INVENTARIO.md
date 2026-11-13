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
| 243 a 252 | Design D1: tokens, contraste, motivos, ponte do tema, logótipo, botão | sim | não | aprovação do logótipo |
| 253 a 266 | Design D2: componentes base (ecrã, campo, cartão, etiqueta, avatar, secção, lista, resultado, esqueleto, movimento) | sim | não | |
| 267 a 283 | Design D3: geometria das cenas, cores das cenas, 29 ícones, ilustrações (mangal, Bijagós, Fortaleza, monumento), cabeçalho da marca, gerador de ícones e arranque, catálogo, `app.json`, guia de design | sim | não | imagem de referência de Cabral, aprovação do design |

## Por entregar (estimativa)

| Bloco | Conteúdo | Ficheiros |
|---|---|---|
| B | Backend novo: PIN, notificações, recibos, suporte, relatórios, troca de número, eliminação de conta, MFA do painel, OpenAPI | cerca de 55 |
| M | App: nova marca nas telas existentes, splash, boas-vindas, registo, PIN, receber, comprovativos, notificações, suporte, segurança, perfil | cerca de 60 |
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
- Imagem de referência da estátua de Amílcar Cabral e aprovação final do design
