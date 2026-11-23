# NODJUNTA-PAY: recibos no app

## Onde se abrem
- **Extrato** (Início, Ver extrato completo): tocar num movimento de transferência, pagamento, depósito, levantamento
  ou devolução. As tarifas e os ajustes não têm recibo e não são tocáveis.
- **Depois de enviar ou pagar:** botão "Ver recibo" no ecrã de sucesso.
- Depósitos e levantamentos: só pelo extrato.

## O que mostra
Número `NP-AAMMDD-NNNNNN`, data, operação, a outra pessoa, valor, tarifa e total debitado (quem enviou), referência
e identificador curto da operação. O telemóvel da outra pessoa vem parcialmente escondido do servidor (`+245 955 *** 302`).
Os nomes são os que cada utilizador escreveu no perfil, não identidade verificada.

## Partilhar
- **PDF:** gerado a partir do texto do recibo (todo escapado). Abre a folha de partilha do telemóvel.
- **Imagem:** captura do cartão tal como se vê no ecrã, em PNG.
- Os ficheiros temporários ficam na cache da app, que o sistema limpa.
- **O recibo é um comprovativo de operação, não um documento fiscal.** O texto não afirma validade fiscal nem legal.

## Preparar (em apps/mobile)
```bash
npx expo install expo-print expo-sharing react-native-view-shot
```
Estas bibliotecas têm código nativo. No Expo Go costumam funcionar, mas num build de produção é preciso um novo build (`eas build`).

## Lista de testes no telemóvel
1. Fazer uma transferência para outro utilizador, com tarifa configurada. No ecrã de sucesso, tocar em "Ver recibo".
   Deve mostrar o valor, a tarifa e o total debitado.
2. Voltar, abrir o extrato e tocar no mesmo movimento: o número `NP-...` é o mesmo.
3. Com o destinatário, abrir o extrato: o movimento recebido abre o recibo dele, com outro número e sem tarifa.
4. Tocar numa linha de tarifa no extrato: não acontece nada.
5. "Partilhar como PDF": abre a folha de partilha. Enviar para si e abrir o PDF: texto legível, valor em destaque.
6. "Partilhar como imagem": o PNG tem o cartão completo, sem os botões.
7. Cortar a internet e abrir um recibo ainda não consultado: aparece o aviso de ligação.
8. Abrir o recibo de um depósito e de um levantamento pelo extrato.

## Se algo correr mal
- **"Não há recibo para esta operação":** o movimento não é do utilizador ou é uma operação interna.
- **A partilha em PDF falha:** confirme que `expo-print` e `expo-sharing` estão instalados. Num build, refaça-o.
- **A imagem sai em branco:** confirme `react-native-view-shot`. O cartão tem de estar visível no ecrã.
