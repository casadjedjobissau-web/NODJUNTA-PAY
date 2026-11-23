# NODJUNTA-PAY: notificações e push

## Duas coisas diferentes
- **Notificações dentro da app** (Mais, Conta, Notificações): funcionam sempre, com a API e a base de dados.
  Não precisam de nenhuma credencial externa.
- **Push** (o aviso no ecrã bloqueado): precisa do projeto EAS e das credenciais FCM (Android) e APNs (iOS).
  Sem elas, a app funciona na mesma, só não recebe avisos fora da app.

## O que a API envia
O texto do push leva só o valor (por exemplo, "Recebeu 4 000 XOF."), nunca o número da outra pessoa.
As respostas do suporte avisam que há resposta, sem mostrar o texto no ecrã bloqueado.

## Preparar a app (em apps/mobile)
1. Instalar as dependências:
   ```bash
   npx expo install expo-notifications expo-device expo-constants
   ```
2. Em `app.json`, acrescentar `"expo-notifications"` à lista `plugins`. Se a lista não existir, criá-la.
3. Ligar o projeto à conta Expo: `eas init`. Isto escreve o `projectId` em `extra.eas.projectId` do `app.json`.
   Sem `projectId`, o token do push não é obtido (o registo falha em silêncio e a app continua a funcionar).
4. Credenciais (confirme na documentação do Expo, mudam com frequência):
   - **Android:** projeto no Firebase, ficheiro `google-services.json` e a chave FCM carregada no EAS (`eas credentials`).
   - **iOS:** chave APNs na conta Apple Developer, carregada no EAS.
5. Push remoto no Android **não funciona no Expo Go** nas versões recentes. Use um build de desenvolvimento ou de teste:
   `eas build --platform android --profile preview`.

## Preparar a API
- `PUSH_ENABLED=true` (por omissão). O ciclo de envio corre a cada 10 segundos.
- `EXPO_ACCESS_TOKEN` só é necessário se ativar a opção de segurança reforçada no painel do Expo.

## Lista de testes
1. Entrar num telemóvel real (não num simulador). Aceitar o pedido de permissão.
2. Na base de dados: `select device_id, platform, push_token from public.devices;` deve mostrar uma linha com `ExponentPushToken[...]`.
   Se `push_token` vier vazio, veja a secção "Se algo correr mal".
3. Com outro utilizador, enviar dinheiro para este telemóvel. Em cerca de 10 segundos deve chegar o aviso.
4. Abrir Mais, Conta, Notificações: a notificação tem o ponto de "não lida". Tocar: o ponto desaparece e o contador desce.
5. "Marcar todas como lidas": o contador fica a zero. Fechar e reabrir a app: continua a zero.
6. Recusar a permissão num segundo telemóvel: a app funciona, a lista de notificações aparece, e não é pedida outra vez.
7. Na base de dados, depois do envio: `select id, kind, push_state from public.notifications order by seq desc limit 5;`
   deve mostrar `sent` (ou `skipped` se o telemóvel não tiver token).

## Se algo correr mal
- **`push_token` vazio:** permissão recusada, simulador, ou falta o `projectId` (passo 3). Num build, confirme também as credenciais.
- **O token existe mas o aviso não chega:** veja `push_state` da notificação. `failed` indica erro do serviço do Expo
  (consulte os registos da API). Confirme as credenciais FCM e APNs.
- **Aviso chega mas ao tocar nada acontece:** é o comportamento atual. As notificações ainda não abrem um destino.
- **Utilizador sem aviso depois de reinstalar a app:** o identificador do dispositivo muda e o token antigo é limpo pela API
  quando o Expo responde `DeviceNotRegistered`. Basta entrar de novo.
