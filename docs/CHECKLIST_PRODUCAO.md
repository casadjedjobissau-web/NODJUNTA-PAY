# NÔDJUNTA PAY: checklist antes de dinheiro real

Nenhum item abaixo está resolvido só por o código existir. Marque cada um com evidência.

## Regulatório e jurídico
- [ ] Modelo definido: licença própria de moeda eletrónica, ou parceria com instituição já autorizada
- [ ] Autorização/aprovação do regulador (BCEAO e autoridades da Guiné-Bissau) obtida por escrito
- [ ] Limites por nível de KYC, tarifas e saldo máximo aprovados pelo regulador/parceiro (os valores atuais são provisórios)
- [ ] Termos de utilização e política de privacidade redigidos por um advogado
- [ ] Política de retenção e proteção dos documentos de KYC definida
- [ ] Procedimentos de prevenção de branqueamento de capitais e de reporte definidos

## Provedor financeiro
- [ ] Contrato com banco/operadora/agregador e documentação oficial da API
- [ ] Implementação real de `FundingProvider` (hoje só existe o sandbox), com verificação de webhook no formato oficial do provedor
- [ ] Testes de ponta a ponta em ambiente de testes do provedor
- [ ] Reconciliação contra o extrato do provedor (hoje só reconciliamos o livro-razão internamente)

## Segurança
- [ ] Revisão de segurança e teste de intrusão por terceiros
- [ ] Segredos só em variáveis de ambiente; `service_role` fora do GitHub e do app; chaves rodadas
- [ ] `SANDBOX_ENABLED`, `WEBHOOK_SECRET_SANDBOX` e `EXPO_PUBLIC_SANDBOX_TOOLS` desligados em produção
- [ ] RLS e permissões revistas no projeto de produção
- [ ] Alertas de erros, de falhas de reconciliação e de webhooks falhados
- [ ] Backups do Supabase ativos e restauro testado

## Lacunas conhecidas do código (ainda por construir)
- [ ] **Painel administrativo** (aprovação de comerciantes e de KYC, suspensão, consulta de auditoria): hoje faz-se por SQL
- [ ] **Eliminação de conta** dentro da app (exigida pela Apple e pela Google)
- [ ] Notificações push e comprovativos partilháveis
- [ ] Antifraude além dos limites (velocidade, dispositivos, listas de bloqueio)
- [ ] Limites aplicados também aos depósitos e saldo máximo da carteira
- [ ] Suporte ao cliente (canal de contacto dentro da app)
- [ ] Ícone, ecrã de arranque e textos finais da app
- [ ] Testes de ponta a ponta com a API e a base de dados reais

## Operação
- [ ] Plano do Render sempre ligado, com monitorização
- [ ] Procedimento para falhas: pedidos pendentes, webhooks perdidos, diferenças na reconciliação
- [ ] Equipa e horário para rever KYC e comerciantes
- [ ] Lançamento gradual com poucos utilizadores e montantes baixos antes da abertura geral

## Lojas
- [ ] Conta Apple (organização) e conta Google Play prontas
- [ ] Política de privacidade publicada num URL público
- [ ] Formulários de privacidade e de segurança dos dados preenchidos
- [ ] TestFlight e teste fechado do Google concluídos
