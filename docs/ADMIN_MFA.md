# NODJUNTA-PAY: segundo fator (MFA) dos administradores

## O que é exigido
Todas as rotas `/admin/v1/*` exigem um token emitido **depois de o administrador confirmar o código do autenticador**
(TOTP). Sem isso a API responde `403 mfa_required`. Se o token não indicar o nível, a API recusa.

A API não gere o segundo fator: quem o inscreve, desafia e verifica é o Supabase Auth, a partir do painel.
A API só verifica o resultado (nível `aal2`, lido do token depois de o Supabase o validar).

## O ecrã do painel
- Depois da palavra-passe, se a API responder `mfa_required`, o painel mostra o ecrã de verificação em dois passos.
- **Primeira vez:** "Configurar o autenticador", ler o QR Code (Google Authenticator, Authy…) e confirmar com o primeiro código.
  A chave também aparece escrita, para quem não consegue ler o QR Code.
- **Seguintes:** escrever o código de 6 dígitos.
- A inscrição só arranca ao toque no botão. Inscrições deixadas a meio são removidas antes de uma nova.
  Nunca se cria um segundo autenticador por cima de um já confirmado.
- Uma conta de cliente que entre no painel também vê este ecrã (a API responde `mfa_required` antes de verificar o papel)
  e, depois do código, recebe "Sem acesso".

## Confirmar antes de usar (documentação oficial do Supabase)
- O MFA por TOTP está ativo no projeto (Authentication, nas definições de MFA).
- O token de sessão inclui a alegação `aal` com os valores `aal1` e `aal2`.
- As funções do cliente: `auth.mfa.getAuthenticatorAssuranceLevel`, `listFactors`, `enroll`, `challenge`, `verify`, `unenroll`,
  e o campo `qr_code` da inscrição.
Estão todas isoladas em `apps/admin/src/lib/supabase-mfa.ts`. Se algum nome for diferente na sua versão, o `typecheck` aponta-o ali.

## Configuração
- Desenvolvimento: `ADMIN_MFA=off` no `.env` da API deixa entrar sem este passo.
- Produção: o MFA está sempre ligado. A API **recusa arrancar** com `ADMIN_MFA=off` em produção.

## Regras de operação
1. **Tenha pelo menos duas contas de administração com autenticador**, para nunca ficar sem acesso.
2. Cada pessoa usa o seu próprio autenticador. Não partilhe códigos nem contas.
3. Se um administrador perder o telemóvel: outro administrador remove o fator no painel do Supabase
   (Authentication, Users, a conta, Factors) e a pessoa inscreve um autenticador novo.
4. O token de sessão tem um prazo curto (cerca de uma hora), e a sessão do painel termina ao fechar o separador.
   Depois, é preciso voltar a confirmar o código.
5. As operações de dois administradores (por exemplo, a troca de número) exigem duas contas **diferentes**,
   cada uma com o seu segundo fator.

## Lista de testes
1. Com `ADMIN_MFA=on` na API, entrar no painel com um administrador novo: aparece "Ative a verificação em dois passos".
2. Configurar o autenticador, ler o QR Code, escrever o código: o painel abre.
3. Terminar a sessão e entrar de novo: aparece "Código de verificação". Um código errado dá "Código incorreto ou expirado".
4. Abrir a página duas vezes seguidas antes de confirmar: continua a haver um só autenticador por confirmar.
5. Com uma conta de cliente: depois do código, aparece "Sem acesso".
6. Com `ADMIN_MFA=off`: o painel entra sem este passo.

## O que o MFA não resolve
- Não protege contra um administrador mal-intencionado que tenha o seu próprio autenticador.
  Para isso existem a auditoria imutável e as regras de duas pessoas.
- Uma conta de cliente também pode inscrever um autenticador, o que é inofensivo: sem o papel de administração, continua a receber `403 forbidden`.
