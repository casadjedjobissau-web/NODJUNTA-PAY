# NODJUNTA-PAY: o PIN no app e na API

## Como funciona
- **Criar:** depois do primeiro login por SMS, o app leva o utilizador a criar um PIN de 6 dígitos. Sem PIN, o resto do app não abre.
- **Usar:** cada transferência, pagamento a comerciante e levantamento pede o PIN numa folha por cima do ecrã.
  O PIN vai no cabeçalho `X-Pin`, é verificado só no servidor e nunca é guardado no telemóvel.
- **Errar:** a API devolve as tentativas que restam. À quinta falha o PIN fica bloqueado durante 15 minutos
  (valores por omissão do servidor).
- **Alterar:** Mais, Segurança, Alterar PIN. Pede o PIN atual.
- **Recuperar:** Mais, Segurança, Recuperar PIN. Só é aceite se o utilizador entrou com o código SMS nos últimos 10 minutos.
  Se não for o caso, o app explica: terminar a sessão, entrar de novo e voltar a abrir "Recuperar PIN" dentro de 10 minutos.
- **Depois de alterar ou recuperar o PIN**, os levantamentos ficam em pausa durante algumas horas (antifraude).
  As transferências e os pagamentos continuam disponíveis.
- **O suporte nunca pede o PIN.** O app diz-lhe isto no ecrã de criar e de recuperar.

## Ligar o PIN na API (por esta ordem)
1. Confirme que as migrations estão aplicadas, em particular `20261110001400_pin.sql` e `20261110002100_fraud.sql`
   (esta última atualiza `pin_replace` para registar a data da troca).
2. No `.env` da API (e nos Secrets do Replit), defina `PIN_PEPPER` com `openssl rand -hex 32` e guarde-o num cofre.
   **Se o perder ou o trocar, todos os PIN deixam de funcionar.**
3. Teste primeiro com `PIN_ENFORCEMENT=off`, no app novo: criar o PIN, e fazer uma transferência.
4. Mude para `PIN_ENFORCEMENT=on` e reinicie a API.
5. Em produção a API **recusa arrancar** com `PIN_ENFORCEMENT=off`.

**Versões antigas do app:** com `PIN_ENFORCEMENT=on`, uma versão do app que não envia o `X-Pin` recebe `pin_required`
nas três operações de dinheiro. Publique o app novo antes de ligar o PIN em produção.

## Lista de testes no telemóvel
1. Entrar com um número novo: aparece "Crie o seu PIN" e não se consegue sair desse ecrã senão terminando a sessão.
2. Tentar `123456`, `111111` e `121212`: o app recusa cada um com a mensagem certa.
3. Criar `482913`. Confirmar com um PIN diferente: o app recomeça.
4. Enviar dinheiro: aparece a folha do PIN. Cancelar: nada acontece e não é cobrado.
5. Errar o PIN: aparece "PIN incorreto. Restam N tentativas." Errar cinco vezes: aparece o tempo de bloqueio.
6. Escrever o PIN certo: a operação conclui. Confira o recibo.
7. Cortar a internet depois de escrever o PIN: aparece o aviso de ligação. Repor a internet, tocar em Confirmar,
   escrever o PIN: o resultado diz que a operação já estava registada e não foi cobrada outra vez.
8. Alterar o PIN: pede o atual. A seguir, tentar um levantamento: deve recusar com a pausa de segurança.
9. Recuperar o PIN logo depois de entrar por SMS: deve funcionar. Com um login antigo: o app explica o caminho.

## Se algo correr mal
- **`pin_required` em todas as operações:** o app está desatualizado, ou o `X-Pin` está a ser removido por um proxy.
- **`pin_not_set`:** o utilizador chegou às operações sem PIN. O app volta ao ecrã de o criar.
- **O app fica no ecrã de erro ao abrir:** `GET /v1/pin` falhou. Confirme que a API tem o serviço de PIN ligado
  (precisa de `PIN_PEPPER`) e que a rota existe.
- **PIN bloqueado a um cliente que errou sem querer:** o bloqueio termina sozinho passados 15 minutos.
  O administrador não consegue desbloquear manualmente. A recuperação do PIN por SMS também o repõe.
