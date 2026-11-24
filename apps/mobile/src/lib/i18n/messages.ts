const PT = {
  "welcome.title": "Bem-vindo à NODJUNTA-PAY",
  "welcome.subtitle": "Envie, receba e pague com o seu telemóvel, de forma simples e segura.",
  "welcome.feature.send": "Envie dinheiro a quem usa a NODJUNTA-PAY, só com o número de telemóvel.",
  "welcome.feature.qr": "Pague nas lojas lendo um QR Code.",
  "welcome.feature.pin": "Confirme cada operação com o seu PIN de 6 dígitos.",
  "welcome.start": "Começar",
  "welcome.illustration": "Ilustração do arquipélago dos Bijagós",
  "language.title": "Idioma",
} as const;

export type MessageKey = keyof typeof PT;

export const pt: Readonly<Record<MessageKey, string>> = PT;

// CRIOULO: deixar vazio até um falante nativo traduzir e validar. Não preencher com traduções automáticas.
// Cada frase traduzida tem de manter os mesmos marcadores {nome} do português.
// Uma frase em falta mostra-se em português, e o crioulo só é oferecido ao utilizador quando todas estiverem traduzidas.
export const kri: Readonly<Partial<Record<MessageKey, string>>> = {};
