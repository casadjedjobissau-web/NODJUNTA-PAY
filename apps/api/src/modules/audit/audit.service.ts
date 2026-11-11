import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEntry, AuditService } from "./audit.types.js";

export function createAuditService(client: SupabaseClient): AuditService {
  return {
    async record(entry: AuditEntry): Promise<void> {
      const { error } = await client.from("audit_logs").insert({
        actor_id: entry.actorId,
        actor_type: entry.actorType,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        ip: entry.ip,
        metadata: entry.metadata,
      });
      if (error) {
        throw new Error(`Falha ao registar auditoria: ${error.message}`);
      }
    },
  };
}
