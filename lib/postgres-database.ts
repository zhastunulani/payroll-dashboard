import {
  neon,
  type FullQueryResults,
  type NeonQueryFunction,
} from "@neondatabase/serverless";

export function postgresQuery(sql: string): string {
  let query = sql.trim();
  const ignoreConflicts = /^INSERT\s+OR\s+IGNORE\s+INTO/i.test(query);
  query = query.replace(/^INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
  query = query.replace(/CASE\s+WHEN\s+\?/gi, "CASE WHEN (? <> 0)");

  let index = 0;
  query = query.replace(/\?/g, () => `$${++index}`);

  if (ignoreConflicts) {
    query = `${query.replace(/;$/, "")} ON CONFLICT DO NOTHING`;
  }
  return query;
}

export class PostgresStatement {
  constructor(
    private readonly database: PostgresDatabase,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): PostgresStatement {
    return new PostgresStatement(this.database, this.sql, values);
  }

  async all<T = Record<string, unknown>>(): Promise<{
    results: T[];
  }> {
    const result = await this.database.execute(this);
    return { results: result.rows as T[] };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.database.execute(this);
    return (result.rows[0] as T | undefined) ?? null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = await this.database.execute(this);
    return {
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }
}

export class PostgresDatabase {
  private readonly sql: NeonQueryFunction<false, true>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString, {
      fullResults: true,
      fetchOptions: {
        cache: "no-store",
      },
    });
  }

  prepare(sql: string): PostgresStatement {
    return new PostgresStatement(this, sql);
  }

  async execute(
    statement: PostgresStatement,
  ): Promise<FullQueryResults<false>> {
    return this.sql.query(
      postgresQuery(statement.sql),
      statement.values,
    );
  }

  async batch(
    statements: PostgresStatement[],
  ): Promise<Array<{ success: true; meta: { changes: number } }>> {
    if (!statements.length) return [];
    const results = await this.sql.transaction(
      (transaction) =>
        statements.map((statement) =>
          transaction.query(
            postgresQuery(statement.sql),
            statement.values,
          ),
        ),
      { fullResults: true },
    );
    return results.map((result) => ({
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    }));
  }
}
