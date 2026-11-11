export type ActorType = "user" | "admin" | "system" | "webhook";

export interface AuditEntry {
  actorId: string | null;
  actorType: ActorType;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditService {
  record(entry: AuditEntry): Promise<void>;
}
