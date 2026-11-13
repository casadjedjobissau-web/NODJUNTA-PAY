# NODJUNTA-PAY: guia de design

Fonte única no código: `apps/mobile/src/design/tokens.ts`. Nunca escrever cores ou tamanhos "à mão" nas telas.

## Cores obrigatórias da marca

| Cor | Valor | Papel |
|---|---|---|
| Verde | `#16A765` | Ação principal, marca, ícones e fundos de destaque |
| Preto | `#101820` | Texto, cabeçalhos, fundos escuros |
| Branco | `#FFFFFF` | Superfícies |
| Azul | `#1769D2` | Informação, ligações, água e arquipélago |

Cores derivadas (não são novas cores de marca): verde profundo `#0E7A47` para texto e ícones verdes sobre claro,
verde suave `#E3F5EC`, azul suave `#E6F0FB` e papel `#F6F8F7` para fundos.
Vermelho e âmbar existem apenas para erros e avisos.

## Regras de contraste (acessibilidade)
- Texto branco sobre o verde de marca **não** passa no contraste de texto normal (cerca de 3,1:1). Botões e cartões verdes levam **texto preto**.
- Texto verde sobre fundo claro usa o verde profundo, nunca o verde de marca.
- Toda a combinação de texto tem de constar de `textPairs` em `tokens.ts`. O teste `contrast.test.ts` falha se algum par ficar abaixo do mínimo (4,5 para texto normal).
- O ecrã `/catalog` mostra todos os pares com a razão calculada.

## Tipografia
Fontes do sistema (sem dependências extra) com a escala definida em `tokens.ts`: legenda 12, pequeno 13, corpo 16, corpo grande 18, título 22, destaque 26, ecrã 32.
Uma fonte própria pode ser avaliada depois da aprovação do design; exige acrescentar a dependência e confirmar a licença.

## Espaçamento e formas
Espaçamento 4, 8, 16, 24, 32, 48. Raios 8, 14, 22, 28. Alturas mínimas de toque de 54 nos botões e campos.

## Motivos culturais
- **Estrela de cinco pontas** (referência à bandeira nacional): no logótipo e como detalhe discreto. Nunca em tamanho grande nem em ecrãs de erro.
- **Faixa tecida** (`WovenBand`): padrões geométricos de losangos, riscas e xadrez inspirados nos tecidos tradicionais. Usar em cabeçalhos e rodapés, nunca atrás de texto.
- **Paisagens e arquitetura:** mangal, arquipélago dos Bijagós e Fortaleza de São José da Amura, como ilustrações vetoriais geométricas. Usar em boas-vindas, estados vazios e ecrãs institucionais, nunca em ecrãs de pagamento.
- **Monumento institucional:** silhueta genérica, sem rosto. A referência a Amílcar Cabral exige respeito histórico: só na apresentação institucional e com uma imagem de referência fornecida ou licenciada.
- Todo o material gráfico é gerado por código. Não há imagens de terceiros.

## Logótipo
Quadrado verde com estrela negra e três losangos brancos, mais a palavra NODJUNTA-PAY. Proposta sujeita a aprovação antes de ir para as lojas.
Zona de respiro mínima: a largura da estrela. Não deformar, não recolorir, não colocar sobre fotografias.

## Componentes
Botão, campo de texto, cartão (claro, escuro, verde), etiqueta, avatar, cabeçalho de secção, linha de lista, cartão de resultado, esqueleto de carregamento, linha de movimento, ícones (29) e cabeçalho da marca.
Ilustrações: mangal, Bijagós, Fortaleza e monumento, em variante escura e clara.

## Movimento
Durações 120, 220 e 360 ms. O esqueleto de carregamento respeita a opção "reduzir movimento" do sistema.

## Gerar os ícones da loja e o ecrã de arranque
```bash
cd apps/mobile
npm install -D sharp tsx
npm pkg set scripts.brand:export="tsx scripts/export-brand-assets.ts"
npm run brand:export
```
Cria `assets/brand/` com `icon.png` (1024, sem transparência), `adaptive-icon.png`, `splash-icon.png` e `favicon.png`. Fazer commit destes ficheiros: o EAS precisa deles.
Correr **antes** de `npx expo start`: o `app.json` aponta para estes ficheiros.

## Pendente de aprovação
- Logótipo e paleta derivada
- Ilustrações e silhueta de monumento
- Escolha de uma fonte própria (opcional)
- Imagem de referência da estátua de Amílcar Cabral
