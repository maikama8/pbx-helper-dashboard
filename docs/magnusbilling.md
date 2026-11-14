# MagnusBilling

Span talks to the MagnusBilling HTTP API the same way the official PHP client does. The body is `application/x-www-form-urlencoded`. The `Sign` header is HMAC-SHA512 of that body, keyed with the API secret. The secret is not sent.

```text
POST {MAGNUS_URL}/user/read
Key: <api key>
Sign: <hex hmac-sha512 of the body>
```

`MAGNUS_URL` includes the front controller:

```text
MAGNUS_URL=https://billing.example/mbilling/index.php
MAGNUS_API_KEY=...
MAGNUS_API_SECRET=...
SOURCE=live
```

Create the key in the MagnusBilling API menu and restrict it to the dashboard address if the panel offers that. The key can refill. Treat it like a wallet. Do not commit it.

## Modules Span calls

| Module | Action | Used for |
| --- | --- | --- |
| `user` | `read` | Customers, credit, active flag |
| `sip` | `read` | SIP users, shown on the extensions page |
| `trunk` | `read` | Trunk inventory. Registration still comes from AMI |
| `rate` | `read` | `dialprefix`, destination, buy rate, sell rate |
| `call` | `read` | CDRs, including `sessionbill` and `buycost` |
| `refill` | `save` | The refill form. Fields are `id_user`, `credit`, `description`, `payment=1` |

Each read asks for the first 200 to 500 rows. A larger install needs paging; that is on the roadmap. Passwords are not requested and are not stored.

Refill is rejected for the viewer role before any HTTP call is made. In demo mode the same form adds credit in memory and never leaves the process.

## Money

When a call row already has `sessionbill` or `buycost`, Span keeps those figures. They are what Magnus actually billed. When they are zero, Span rates the number with the rate table: longest prefix, per-second, six decimal places. A prefix is ignored when the dialed number is shorter than `minLength`, so an extension that starts with `1` is not sold as the United States.

If MySQL CDR is also configured, Magnus stays the billing source and MySQL supplies CEL. Magnus knows the price. `asteriskcdrdb` knows the channel events.
