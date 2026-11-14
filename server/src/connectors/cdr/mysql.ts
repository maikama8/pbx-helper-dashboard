import type { CdrMysqlConfig } from "../../config.js";
import type { Cdr, CelEvent, Rate } from "../../domain/types.js";
import { cdrQuery, celQuery, mapMysqlCdr, mapMysqlCel, type MysqlCdrRow, type MysqlCelRow } from "./sql.js";

/** Read `cdr` and `cel` with a short-lived connection. The SQL is parameterised in `sql.ts`. */
export async function loadMysqlCdr(
  config: CdrMysqlConfig,
  rates: readonly Rate[],
  extensions: readonly string[],
  trunks: readonly string[],
): Promise<{ cdrs: Cdr[]; cel: CelEvent[] }> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  });
  try {
    const cdr = cdrQuery(2, 2000);
    const cel = celQuery(2, 200);
    const [cdrRows] = await connection.execute(cdr.sql, cdr.params);
    const [celRows] = await connection.execute(cel.sql, cel.params);
    return {
      cdrs: (cdrRows as MysqlCdrRow[]).map((row) => mapMysqlCdr(row, rates, extensions, trunks)),
      cel: (celRows as MysqlCelRow[]).map(mapMysqlCel),
    };
  } finally {
    await connection.end();
  }
}
