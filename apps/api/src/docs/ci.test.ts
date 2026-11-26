import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rootPath(relative: string): string {
  return fileURLToPath(new URL(`../../../../${relative}`, import.meta.url));
}

function readYaml(relative: string): Obj {
  const parsed: unknown = parse(readFileSync(rootPath(relative), "utf8"));
  if (!isObj(parsed)) {
    throw new Error(`${relative} não é um documento YAML válido`);
  }
  return parsed;
}

const workflow = readYaml(".github/workflows/ci.yml");
const dependabot = readYaml(".github/dependabot.yml");

interface Step {
  run: string | null;
  uses: string | null;
  dir: string;
}

interface Job {
  id: string;
  timeout: unknown;
  steps: Step[];
}

function jobs(): Job[] {
  const all = isObj(workflow.jobs) ? workflow.jobs : {};
  return Object.entries(all).flatMap(([id, value]) => {
    if (!isObj(value)) {
      return [];
    }
    const defaults = isObj(value.defaults) && isObj(value.defaults.run) ? value.defaults.run : {};
    const defaultDir = typeof defaults["working-directory"] === "string" ? defaults["working-directory"] : ".";
    const rawSteps = Array.isArray(value.steps) ? value.steps : [];
    const steps = rawSteps.filter(isObj).map((step) => ({
      run: typeof step.run === "string" ? step.run : null,
      uses: typeof step.uses === "string" ? step.uses : null,
      dir: typeof step["working-directory"] === "string" ? step["working-directory"] : defaultDir,
    }));
    return [{ id, timeout: value["timeout-minutes"], steps }];
  });
}

function scriptsOf(dir: string): Obj | null {
  const file = rootPath(dir === "." ? "package.json" : `${dir}/package.json`);
  if (!existsSync(file)) {
    return null;
  }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  return isObj(parsed) && isObj(parsed.scripts) ? parsed.scripts : {};
}

function runsOf(job: Job): string[] {
  return job.steps.flatMap((step) => (step.run === null ? [] : [step.run]));
}

function jobById(id: string): Job {
  const job = jobs().find((item) => item.id === id);
  if (!job) {
    throw new Error(`job em falta: ${id}`);
  }
  return job;
}

describe(".github/workflows/ci.yml", () => {
  it("tem os seis jobs esperados", () => {
    expect(jobs().map((job) => job.id).sort()).toEqual(["admin", "api", "dependencies", "mobile", "secrets", "sql"]);
  });

  it("corre em cada push para o main e em cada pull request", () => {
    const on = workflow.on;
    expect(isObj(on)).toBe(true);
    if (isObj(on)) {
      expect(isObj(on.push) && Array.isArray(on.push.branches) ? on.push.branches : []).toContain("main");
      expect("pull_request" in on).toBe(true);
    }
  });

  it("só pede permissão de leitura ao repositório", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("todos os jobs têm um limite de tempo razoável", () => {
    for (const job of jobs()) {
      expect(typeof job.timeout, job.id).toBe("number");
      expect(Number(job.timeout), job.id).toBeGreaterThan(0);
      expect(Number(job.timeout), job.id).toBeLessThanOrEqual(60);
    }
  });

  it("todas as ações estão fixadas a uma versão principal (por exemplo @v4)", () => {
    const pattern = /^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@v\d+(\.\d+){0,2}$/;
    const loose = jobs().flatMap((job) =>
      job.steps.flatMap((step) => (step.uses !== null && !pattern.test(step.uses) ? [`${job.id}: ${step.uses}`] : [])),
    );
    expect(loose).toEqual([]);
  });

  it("todos os scripts npm que chama existem no package.json da pasta certa", () => {
    const problems: string[] = [];
    for (const job of jobs()) {
      for (const step of job.steps) {
        for (const match of (step.run ?? "").matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
          const name = match[1] ?? "";
          const scripts = scriptsOf(step.dir);
          if (scripts === null) {
            problems.push(`${job.id}: não existe package.json em ${step.dir}`);
          } else if (!(name in scripts)) {
            problems.push(`${job.id}: o script "${name}" não existe em ${step.dir}/package.json`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("instala sempre com npm ci, e nunca com npm install", () => {
    for (const job of jobs()) {
      for (const run of runsOf(job)) {
        expect(/\bnpm (install|i)\b/.test(run), `${job.id}: ${run}`).toBe(false);
      }
    }
    for (const id of ["api", "admin", "mobile"]) {
      expect(runsOf(jobById(id)), id).toContain("npm ci");
    }
  });

  it("os package-lock.json de que o npm ci precisa existem (faça commit deles)", () => {
    const missing = ["package-lock.json", "apps/admin/package-lock.json", "apps/mobile/package-lock.json"].filter(
      (file) => !existsSync(rootPath(file)),
    );
    expect(missing).toEqual([]);
  });

  it("os scripts auxiliares que o fluxo chama existem, e cada job usa o seu", () => {
    const referenced = new Set<string>();
    for (const job of jobs()) {
      for (const run of runsOf(job)) {
        for (const match of run.matchAll(/bash (scripts\/[\w.-]+\.sh)/g)) {
          referenced.add(match[1] ?? "");
        }
      }
    }
    expect([...referenced].sort()).toEqual(["scripts/check-secrets.sh", "scripts/run-sql-tests.sh"]);
    for (const file of referenced) {
      expect(existsSync(rootPath(file)), file).toBe(true);
    }
    expect(runsOf(jobById("sql")).join("\n")).toContain("scripts/run-sql-tests.sh");
    expect(runsOf(jobById("secrets")).join("\n")).toContain("scripts/check-secrets.sh");
  });

  it("o job da base de dados instala o CLI do Supabase e arranca-o antes dos testes", () => {
    const job = jobById("sql");
    expect(job.steps.some((step) => step.uses?.startsWith("supabase/setup-cli@") === true)).toBe(true);
    const runs = runsOf(job);
    const start = runs.findIndex((run) => run.includes("supabase start"));
    const tests = runs.findIndex((run) => run.includes("run-sql-tests.sh"));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(tests).toBeGreaterThan(start);
  });
});

describe(".github/dependabot.yml", () => {
  it("cobre a API, o painel, o app e as ações do GitHub", () => {
    const updates = Array.isArray(dependabot.updates) ? dependabot.updates.filter(isObj) : [];
    const npmDirectories = updates.filter((item) => item["package-ecosystem"] === "npm").map((item) => item.directory);
    expect(npmDirectories.sort()).toEqual(["/", "/apps/admin", "/apps/mobile"]);
    expect(updates.some((item) => item["package-ecosystem"] === "github-actions")).toBe(true);
  });
});
