# @cinnetemple/sdk

Typed TypeScript API client for CinneTemple, generated from the backend's
OpenAPI document (`/docs-json`) and built on `@cinnetemple/shared` contracts.

Responsibilities: typed methods per endpoint, automatic access-token attach,
transparent refresh-token rotation on 401, and error normalization.

> Scaffolded now; generated against the live spec during the Phase 1 web build
> (`openapi-typescript` + a thin fetch wrapper).
