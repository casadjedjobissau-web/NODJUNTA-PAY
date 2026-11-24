# NODJUNTA-PAY: idiomas e bloqueio da app

## Idiomas
- O texto vem de `apps/mobile/src/lib/i18n/messages.ts`. O português (`pt`) está completo. O crioulo (`kri`) está vazio.
- **Quem traduz tem de ser um falante nativo.** Não preencha `kri` com tradução automática.
- Uma frase em falta mostra-se em português. O crioulo só aparece como opção em Mais quando **todas** as frases estiverem traduzidas.

### Como acrescentar uma tradução
1. Em `kri`, acrescente a chave com a tradução, por exemplo `"welcome.start": "..."`.
2. Se o português tiver marcadores como `{nome}`, a tradução tem de ter os mesmos.
3. Corra `npm run test` em `apps/mobile`. O teste "o dicionário de crioulo é sempre válido contra o português" falha se houver uma chave que não existe, uma frase vazia ou marcadores diferentes.
4. Quando a cobertura chegar a 100%, a escolha de idioma aparece sozinha em Mais.

### Passar os restantes ecrãs para o dicionário (por fazer)
Hoje só as boas-vindas usam `t(...)`. Para passar um ecrã: acrescente as frases a `pt` em `messages.ts`, e no ecrã troque o texto por
`const { t } = useI18n();` e `t("chave")`. Faça-o ecrã a ecrã, e só depois de haver tradução validada.
Os textos que vêm da API (mensagens de erro) estão em português e não passam por este dicionário.

## Bloqueio da app (biometria)
- **Onde:** Mais, Segurança, "Bloquear a app". Fica desligado por omissão.
- **O que faz:** pede biometria ou o código do telemóvel ao abrir a app e depois de 30 segundos fora dela.
- **O que não faz:** não substitui o PIN, e não protege a conta no servidor. O dinheiro continua a pedir sempre o PIN.
  Protege quem pega num telemóvel que já estava desbloqueado.
- **Se a biometria deixar de estar configurada:** o ecrã de bloqueio oferece "Terminar sessão". Entra-se de novo por SMS.
- **Camara do KYC:** abrir a câmara pode pôr a app em segundo plano. Só bloqueia se passarem mais de 30 segundos.

### Preparar
```bash
cd apps/mobile
npx expo install expo-local-authentication
```
No `app.json`, acrescente à lista `plugins` (confirme o nome e as opções na documentação do Expo):
```json
["expo-local-authentication", { "faceIDPermission": "Permitir que a NODJUNTA-PAY use o Face ID para desbloquear a app." }]
```
Precisa de um build novo (`eas build`), porque o Expo Go pode não bastar.

### Lista de testes no telemóvel
1. Mais, Segurança, ligar "Bloquear a app": pede a biometria para confirmar. Sem biometria registada, aparece o aviso.
2. Fechar a app e abrir de novo: aparece o ecrã de bloqueio e a biometria é pedida logo.
3. Cancelar o pedido: aparece a mensagem e o botão "Desbloquear".
4. Sair da app durante 10 segundos e voltar: não bloqueia. Durante mais de 30 segundos: bloqueia.
5. Com a app bloqueada, tocar em "Terminar sessão": volta ao login.
6. Desligar o bloqueio: a app deixa de bloquear.
7. Remover a biometria nas definições do telemóvel com o bloqueio ligado e reabrir a app: o desbloqueio falha e "Terminar sessão" continua disponível.
