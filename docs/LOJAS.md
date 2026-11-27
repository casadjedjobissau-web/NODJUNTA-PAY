# NODJUNTA-PAY: publicar o app (EAS, Google Play e App Store)

**Os pontos das lojas mudam com frequência** (taxas, prazos de teste, formulários, regras). Cada ponto marcado "confirme" está
escrito de memória. Vale a documentação oficial de cada loja no dia em que publicar.

## 1. Preparar o EAS (uma vez)
```bash
cd apps/mobile
npm install -g eas-cli
eas login
eas init
```
O `eas init` escreve o `projectId` no `app.json`, de que o push precisa.

**Variáveis públicas da app** (valores públicos, não são segredos): crie-as no EAS para o perfil `production` (confirme o comando na
documentação, por exemplo `eas env:create`):
- `EXPO_PUBLIC_API_URL`: o endereço da API de produção
- `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`: a chave `anon`, **nunca** a `service_role`

O perfil `production` tem `EXPO_PUBLIC_SANDBOX_TOOLS=false`: os botões de simulação de depósitos não existem na versão das lojas.

## 2. Notificações push (credenciais)
- **Android:** um projeto no Firebase, a conta de serviço (FCM v1) carregada no EAS (`eas credentials`). Confirme os passos atuais.
- **iOS:** a chave APNs da sua conta Apple Developer, carregada no EAS (o `eas build` oferece-se para a criar).
- Sem isto a app funciona, mas não recebe avisos fora da app.

## 3. Testar antes de publicar
```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```
O `preview` do Android gera um APK que instala diretamente. O do iOS exige o registo do aparelho (o EAS guia-o).
Num build real testam-se: o push, a biometria, a câmara (QR e KYC), a partilha de recibos. O Expo Go não chega para tudo isto.

## 4. Google Play
1. **Conta de programador** (taxa única, confirme o valor), com verificação de identidade.
2. **Criar a app** e preencher a ficha: nome, descrição curta e longa em português, ícone, imagem de destaque, capturas de ecrã de telemóvel.
3. **Política de privacidade** num endereço público. É obrigatória. O texto tem de ser revisto por um advogado.
4. **Segurança dos dados** (formulário): diga com verdade o que a app recolhe (telemóvel, nome, documentos de identidade, movimentos
   financeiros, token de notificações, identificador do dispositivo) e para quê.
5. **Eliminação de conta:** a Google exige que a app tenha eliminação de conta **dentro da app** (existe: Mais, Segurança, Eliminar conta)
   **e um endereço web** onde se possa pedir a eliminação. **Esse endereço ainda não existe.** Ver `docs/DECISOES.md`.
6. **Serviços financeiros:** a Google tem uma declaração própria para apps financeiras e pode pedir documentos de licenciamento.
   Confirme o que se aplica à Guiné-Bissau e ao seu modelo (licença própria ou parceria).
7. **Classificação de conteúdo** e **público-alvo** (formulários).
8. **Testes:** contas pessoais novas podem ter de fazer um teste fechado com um número mínimo de testadores durante um prazo antes de
   poderem publicar em produção. Confirme as regras atuais.
9. **Enviar:** `eas build --platform android --profile production` gera um pacote `.aab`; depois `eas submit --platform android --profile production`
   (ou carregue-o à mão). O perfil envia para a faixa `internal` como **rascunho**: nada fica público até você publicar.

## 5. App Store (Apple)
1. **Apple Developer Program** (anual, confirme o valor). Para uma **organização** é preciso um número D-U-N-S.
2. **Apps financeiras:** as regras da Apple exigem, em geral, que a app seja submetida pela entidade que presta o serviço financeiro.
   Confirme as diretrizes. Isto condiciona **quem** pode ter a conta.
3. **Criar a app** no App Store Connect com o identificador `com.nodjuntapay.app`. **Depois de publicado, o identificador não muda.**
4. **Eliminação de conta dentro da app:** obrigatória (existe).
5. **Privacidade da app** (etiquetas de nutrição) e **política de privacidade** num endereço público.
6. **Conformidade de exportação:** a app usa só HTTPS e criptografia padrão do sistema. A declaração (por exemplo, `usesNonExemptEncryption`)
   é uma **declaração legal sua**: confirme-a antes de a submeter. Eu não a pus no `app.json`.
7. **Conta de demonstração para os revisores:** os revisores precisam de entrar na app. Como o login é por SMS, use o **número de teste**
   com código fixo (ver `docs/PUBLICACAO.md`, passo 1.3), e dê-lhes essas instruções nas notas de revisão. Sem isto, a revisão fica bloqueada.
8. **TestFlight:** `eas build --platform ios --profile production`, depois `eas submit --platform ios`. Teste com pessoas reais antes de submeter à revisão.

## 6. O que as lojas pedem e eu não tenho
Ícone 1024x1024 (existe em `assets/brand`), capturas de ecrã nos tamanhos pedidos, textos da ficha, URL da política de privacidade,
URL de suporte (use os dois telefones: +245 956 191 968 e +245 956 656 700), URL de eliminação de conta, e os formulários de
privacidade e de segurança dos dados preenchidos por quem conhece a operação.

## 7. Versões seguintes
O `eas.json` usa `autoIncrement` e a versão remota: cada `eas build --profile production` sobe o número de compilação.
Quando mudar de versão do Expo, faça-o à mão com `npx expo install --fix`. O Dependabot ignora o Expo e o React Native de propósito.
**Não há atualizações por ar (EAS Update) configuradas:** cada correção passa por uma nova versão nas lojas.
