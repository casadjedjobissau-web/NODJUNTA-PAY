export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface PushTicket {
  status: "ok" | "error";
  error?: string;
}

export interface PushSender {
  // Devolve um bilhete por mensagem, pela mesma ordem. Lança um erro se o envio falhar por completo.
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}
