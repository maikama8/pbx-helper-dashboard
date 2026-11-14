# FreePBX

Span uses two FreePBX sources, and they are independent.

- GraphQL for the extension and trunk inventory.
- A read-only MySQL user on `asteriskcdrdb` for CDR and CEL.

AMI, documented in [asterisk-ami.md](asterisk-ami.md), is what makes that inventory live. GraphQL does not report registration.

## GraphQL token

On the PBX, as a user who may administer FreePBX:

```bash
fwconsole api gen-token --user admin
```

The commercial and open-source modules expose GraphQL at:

```text
https://pbx.example/admin/api/api/gql
```

```text
FREEPBX_GRAPHQL_URL=https://pbx.example/admin/api/api/gql
FREEPBX_TOKEN=...
SOURCE=live
```

Span sends `Authorization: Bearer` and two queries, `fetchAllExtensions` and `fetchAllTrunks`. The extension query asks for `extensionId`, the user name, the outbound caller ID, and the device technology. It does not ask for the SIP secret.

`fetchAllTrunks` is the core module's trunk list (`trunkid`, `name`, `tech`, `channelid`, `disabled`). A FreePBX build that has not loaded that field returns a GraphQL error. Span keeps the last good inventory and puts the error on `/api/health`. Confirm the schema with the GraphQL playground on that PBX if the trunk list stays empty.

The token is an admin credential. Keep it in the environment.

## CDR and CEL

`asteriskcdrdb` is the database FreePBX already writes. Span only needs `SELECT` on `cdr` and `cel`.

```sql
CREATE USER 'span_cdr'@'203.0.113.10' IDENTIFIED BY 'replace-this';
GRANT SELECT ON asteriskcdrdb.cdr TO 'span_cdr'@'203.0.113.10';
GRANT SELECT ON asteriskcdrdb.cel TO 'span_cdr'@'203.0.113.10';
FLUSH PRIVILEGES;
```

Use the dashboard host, not `%`. The queries are parameterised: a day window and a limit, both bound. Span does not write, and it does not connect to the `asterisk` database where passwords live.

```text
CDR_HOST=203.0.113.5
CDR_PORT=3306
CDR_USER=span_cdr
CDR_PASSWORD=replace-this
CDR_DATABASE=asteriskcdrdb
```

Rows are rated with the Magnus rate table when that connector is configured. With no Magnus rates, matched prefixes are empty and the cost columns are zero, which is honest: FreePBX CDR has duration, not a tariff. Disposition comes from the `cdr.disposition` column (`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`, `CONGESTION`).

CEL is the last 200 events in two days: `eventtype`, time, caller, extension, channel, uniqueid, context. It is the trace under the CDR table, not a second billing source.

Do not point `CDR_USER` at a privileged MySQL account. `SHOW GRANTS` should be those two `SELECT`s and nothing else.
