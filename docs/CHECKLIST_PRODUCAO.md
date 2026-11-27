# NODJUNTA-PAY: checklist antes de dinheiro real

**Nenhum item está resolvido só por o código existir.** Marque cada um com evidência (uma captura, um registo, um documento).
**Estado do código:** tudo o que está abaixo como "escrito" **nunca foi executado**. A primeira execução é o primeiro item.

## 0. Primeira execução (antes de tudo)
- [ ] `npm install` na raiz, em `apps/admin` e em `apps/mobile`, e os três `package-lock.json` com commit
- [ ] `typecheck` e testes a passar na API (790 esperados), no painel e no app
- [ ] Migrations aplicadas e `scripts/run-sql-tests.sh` verde (inclui `security_smoke.sql`) num projeto **de testes**
- [ ] `npm run test:e2e` verde (16 passos) contra um Supabase local
- [ ] Integração contínua verde no GitHub, e o ramo `main` protegido
- [ ] O app e o painel percorridos num telemóvel real e num navegador, com as listas de testes de cada guia

## 1. Regulatório e jurídico (fora do código)
- [ ] Modelo definido: licença própria de moeda eletrónica, ou parceria com instituição já autorizada
- [ ] Aprovação do regulador (BCEAO e autoridades da Guiné-Bissau) obtida por escrito
- [ ] Limites por nível de KYC, tarifas e saldo máximo aprovados (**os valores atuais são provisórios**)
- [ ] Limiares do antifraude definidos com a conformidade (10 operações em 10 minutos, 24 horas de pausa, 500 000 XOF: provisórios)
- [ ] Termos de utilização e política de privacidade redigidos por um advogado, incluindo os textos do ecrã de eliminar conta
- [ ] **Prazo de conservação dos documentos de KYC** decidido, e `npm run purge-kyc -- DIAS` agendado ou executado com esse prazo
- [ ] Procedimentos contra o branqueamento de capitais e de reporte
- [ ] O recibo é um comprovativo de operação, não um documento fiscal: confirmar com um advogado o que a lei exige

## 2. Provedor financeiro (fora do código)
- [ ] Contrato com banco, operadora ou agregador, e documentação oficial da API
- [ ] Implementação real de `FundingProvider` (hoje só existe o sandbox) e verificação de webhook no formato oficial do provedor
- [ ] Testes de ponta a ponta no ambiente de testes do provedor
- [ ] Reconciliação contra o extrato do provedor (hoje só se reconcilia o livro-razão internamente)
- [ ] Processo para depósitos e levantamentos pendentes, webhooks perdidos e diferenças na reconciliação

## 3. Segurança
- [ ] Teste de intrusão por especialistas independentes
- [ ] `service_role` e `PIN_PEPPER` só no Render, e `PIN_PEPPER` guardado num cofre (perdê-lo invalida todos os PIN)
- [ ] Em produção: `SANDBOX_ENABLED` desligado, `PIN_ENFORCEMENT=on`, `ADMIN_MFA=on` (a API recusa arrancar de outra forma)
- [ ] Pelo menos **duas** contas `admin`, cada uma com autenticador
- [ ] MFA por TOTP ligado no Supabase de produção
- [ ] Alertas de erros e de falhas da reconciliação (**não há integração com um serviço de alertas**), e monitor externo em `/health`
- [ ] Cópias de segurança do Supabase ativas e **restauro testado**
- [ ] `Cache-Control: no-store` nas respostas com saldos (recomendação ainda por fazer)
- [ ] Rotação de chaves prevista (service_role, chave do SMS, chaves do push)

## 4. O que já está escrito no código (por verificar na primeira execução)
- [x] Livro-razão de partidas dobradas, idempotência, limites e tarifas
- [x] PIN de 6 dígitos, bloqueio por tentativas, recuperação por SMS recente
- [x] Notificações dentro da app e envio de push
- [x] Recibos imutáveis, partilha em PDF e imagem
- [x] Suporte (pedidos, painel) e contactos
- [x] Eliminação de conta (anonimização)
- [x] Troca de número com duas pessoas
- [x] MFA dos administradores, painel, relatórios e exportação CSV
- [x] Antifraude (velocidade, pausa nos levantamentos, montante elevado) e alertas
- [x] Bloqueio da app por biometria; estrutura de idiomas
- [x] Documentação OpenAPI, integração contínua, testes de segurança e de ponta a ponta

## 5. Lacunas conhecidas (ainda por construir)
- [ ] Limites aplicados também aos depósitos, e saldo máximo da carteira
- [ ] Receber dinheiro por QR pessoal (hoje recebe-se pelo número de telemóvel; o QR é só do comerciante)
- [ ] Antifraude além dos limiares simples: dispositivo novo, listas de bloqueio, pontuação de risco
- [ ] Endereço web para pedir a eliminação da conta (exigido pela Google Play)
- [ ] Tradução para crioulo (precisa de um falante nativo) e passagem dos ecrãs ao dicionário de idiomas
- [ ] Apresentação institucional com a referência a Amílcar Cabral (falta a imagem de referência e o texto)
- [ ] Integração com um serviço de alertas de erros
- [ ] Atualizações por ar (EAS Update)

## 6. Operação
- [ ] Equipa e horário para rever KYC, comerciantes, suporte e alertas de fraude
- [ ] Plano de incidentes: quem decide congelar uma carteira, quem fala com o cliente, quem avisa o regulador
- [ ] Lançamento gradual: poucos utilizadores e montantes baixos antes da abertura geral
- [ ] Plano do Render sempre ligado, com monitorização

## 7. Lojas
- [ ] Contas Apple (organização) e Google Play prontas, e a entidade certa a submeter
- [ ] Política de privacidade e URL de eliminação de conta publicados
- [ ] Formulários de privacidade e de segurança dos dados preenchidos com verdade
- [ ] Número de teste com código fixo, para os revisores entrarem
- [ ] TestFlight e teste fechado do Google concluídos
