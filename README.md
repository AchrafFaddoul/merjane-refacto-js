# Merjane

Order-processing refactor focused on layer separation, readable business rules and regression coverage.

## What changed

The controller previously combined HTTP handling, product rules and database access. These responsibilities are now separated:

| Component | Responsibility |
| --- | --- |
| [Controller](src/controllers/my-controller.ts) | Validate HTTP parameters, delegate and send the response |
| [OrderService](src/services/impl/order.service.ts) | Load the order and coordinate sequential product processing |
| [ProductService](src/services/impl/product.service.ts) | Apply product rules and coordinate persistence/notifications |
| [Repositories](src/repositories) | Execute Drizzle queries and map order relations |

Services depend on repository and notification contracts, with no Fastify or Drizzle imports. Domain types are independent of persistence; Awilix connects the implementations. Product rules and stock decrement are centralized, removing duplicated expiration logic.

The existing stack, dependencies and classes/interfaces marked `// WARN: Should not be changed during the exercise` remain unchanged. No business-rule correction was introduced.

## Tests and verification

- **37 unit tests:** isolated services with repository fakes/mocks and fixed dates; no database.
- **38 integration tests:** 37 HTTP cases through Fastify, real services and SQLite, plus a repository persistence test. Notifications are mocked.
- Coverage includes stock updates, notifications, date boundaries, mixed/empty orders, invalid/missing IDs, repeated processing and failures. The 28 product cases established before refactoring are shared between unit and HTTP tests.

All 75 tests, TypeScript checks and lint passed. Verified with Node.js 22.23.1 and pinned pnpm 9.1.4; use `corepack enable pnpm` if the pnpm version differs.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm lint
```

`pnpm test:unit` and `pnpm test:integration` watch for changes; add `--run` for one run.

Integration tests use a single fork worker to avoid an observed native crash with thread workers. The commands above include this configuration.

## Preserved behavior and limitations

These observations are retained for compatibility, not asserted as approved business rules:

- Empty NORMAL products with nonpositive lead time send no delay notification; negative stock is retained.
- Season endpoints are excluded from direct sales, but replenishment exactly at season end is allowed. Expiration exactly now counts as expired.
- Empty but unexpired EXPIRABLE products send an expiration notification.
- Unknown types are ignored; missing orders return 500. Nullable product dates remain unvalidated; existing non-null assertions do not validate them.
- Reprocessing decrements stock again. Writes are sequential, without an order transaction or concurrent-order protection; earlier updates survive later failures.
- Delay notifications follow persistence; seasonal-unavailability/expiration notifications precede it.

The supplied notification implementation remains a no-op stub; tests verify notification calls, not delivery.
