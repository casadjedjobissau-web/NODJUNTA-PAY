import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DateRangeError, resolveDateRange, type DateRange } from "../../lib/date-range.js";
import { createAdminGuard } from "../../plugins/admin-auth.js";
import type { AdminService } from "../admin/admin.types.js";
import { ReportError, type ReportService } from "./reports.types.js";

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

const merchantsQuery = rangeQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export interface ReportRouteOptions {
  now?: () => Date;
}

function actorId(request: FastifyRequest): string {
  const user = request.authUser;
  if (!user) {
    throw new Error("Pedido de administração sem utilizador autenticado");
  }
  return user.id;
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function sendKnownError(err: unknown, reply: FastifyReply) {
  if (err instanceof ReportError) {
    return reply.status(err.httpStatus).send({ error: err.code, message: err.message });
  }
  throw err;
}

export function registerReportRoutes(
  scope: FastifyInstance,
  admin: AdminService,
  reports: ReportService,
  options: ReportRouteOptions = {},
): void {
  const guard = createAdminGuard(admin);
  const now = options.now ?? (() => new Date());

  function parseRange(
    query: { from?: string | undefined; to?: string | undefined },
    reply: FastifyReply,
  ): DateRange | null {
    try {
      return resolveDateRange(query.from, query.to, now());
    } catch (err) {
      if (err instanceof DateRangeError) {
        reply.status(400).send({ error: "invalid_query", message: err.message });
        return null;
      }
      throw err;
    }
  }

  scope.get("/reports/summary", { preHandler: guard("reports:read") }, async () => reports.summary());

  scope.get("/reports/daily", { preHandler: guard("reports:read") }, async (request, reply) => {
    const query = rangeQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    const range = parseRange(query.data, reply);
    if (!range) {
      return reply;
    }
    try {
      return await reports.daily(range.from, range.to);
    } catch (err) {
      return sendKnownError(err, reply);
    }
  });

  scope.get(
    "/reports/daily.csv",
    { preHandler: guard("reports:read"), config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const query = rangeQuery.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
      }
      const range = parseRange(query.data, reply);
      if (!range) {
        return reply;
      }
      try {
        const csv = await reports.exportDailyCsv(actorId(request), range.from, range.to, request.ip);
        return reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="relatorio-diario-${range.from}_${range.to}.csv"`)
          .header("cache-control", "no-store")
          .send(csv);
      } catch (err) {
        return sendKnownError(err, reply);
      }
    },
  );

  scope.get("/reports/merchants", { preHandler: guard("reports:read") }, async (request, reply) => {
    const query = merchantsQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: "invalid_query", message: describeIssues(query.error) });
    }
    const range = parseRange(query.data, reply);
    if (!range) {
      return reply;
    }
    try {
      return { items: await reports.merchants(range.from, range.to, query.data.limit) };
    } catch (err) {
      return sendKnownError(err, reply);
    }
  });
}
