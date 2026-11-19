# NODJUNTA-PAY: segundo fator (MFA) dos administradores

## O que é exigido
Todas as rotas `/admin/v1/*` exigem um token emitido **depois de o administrador confirmar o código do autenticador**
(TOTP). Sem isso a API responde `403 mfa_required`. Se o token não indicar o nível, a API recusa.

A API não gere o segundo fator: quem o inscreve, desafia e verifica é o Supabase Auth, a partir do painel.
A API só verifica o resultado (nível `aal2`, lido do token depois de o Supabase o validar).

## Confirmar antes de usar (documentação oficial do Supabase)
- O MFA por TOTP está ativo no projeto (Authentication, nas definições de MFA).
- O token de sessão inclui a alegação `aal` com os valores `aal1` e `aal2`.
- As funções do cliente: `auth.mfa.enroll`, `auth.mfa.challenge`, `auth.mfa.verify`,
  `auth.mfa.getAuthenticatorAssuranceLevel`.
Se algum destes nomes for diferente na sua versão, diga-me: o ajuste é pequeno, mas tem de ser feito antes de ligar o MFA.

## Configuração
- Desenvolvimento: `ADMIN_MFA=off` no `.env`, até o painel ter o ecrã de segundo fator (Bloco A).
- Produção: o MFA está sempre ligado. A API **recusa arrancar** com `ADMIN_MFA=off` em produção.
- O painel precisa de: ecrã para inscrever o autenticador (QR Code), ecrã para introduzir o código a cada entrada,
  e tratamento da resposta `mfa_required` da API. Entra no Bloco A.

## Regras de operação
1. **Tenha pelo menos duas contas de administração com autenticador**, para nunca ficar sem acesso.
2. Cada pessoa usa o seu próprio autenticador. Não partilhe códigos nem contas.
3. Se um administrador perder o telemóvel: outro administrador remove o fator no painel do Supabase
   (Authentication, Users, a conta, Factors) e a pessoa inscreve um autenticador novo.
4. O token de sessão tem um prazo curto (cerca de uma hora). Depois, é preciso voltar a confirmar o código.
5. As operações de dois administradores (por exemplo, a troca de número) exigem duas contas **diferentes**,
   cada uma com o seu segundo fator.

## O que o MFA não resolve
- Não protege contra um administrador mal-intencionado que tenha o seu próprio autenticador.
  Para isso existem a auditoria imutável e as regras de duas pessoas.
- Uma conta de cliente também pode inscrever um autenticador, o que é inofensivo: sem o papel de administração, continua a receber `403 forbidden`.
