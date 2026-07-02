# CinneTemple — API Specification (Phase 1: Authentication)

> Style: REST over HTTPS, JSON. GraphQL is introduced later for read-heavy
> aggregation endpoints. All endpoints are documented in-code via Swagger
> (`@nestjs/swagger`) and served at `/docs` (non-prod) — the live spec is the
> source of truth; this file is the human-readable summary + machine spec.

Base URL (local): `http://localhost:4000`
Base URL (prod): `https://api.cinnetemple.com`

## Conventions

- **Auth:** `Authorization: Bearer <accessToken>` for protected routes.
- **Errors:** RFC 7807-style `application/problem+json`:
  ```json
  { "type": "about:blank", "title": "Unauthorized", "status": 401,
    "detail": "Access token expired", "instance": "/v1/auth/me",
    "correlationId": "01J..." }
  ```
- **Versioning:** URI prefix `/v1`.
- **Rate limits:** `429` with `Retry-After`. Returned headers: `X-RateLimit-*`.
- **Idempotency:** mutating auth calls accept an `Idempotency-Key` header.

## Endpoint summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/register` | – | Register with email + password |
| POST | `/v1/auth/verify-email` | – | Confirm email with OTP code |
| POST | `/v1/auth/login` | – | Email/password login → tokens |
| POST | `/v1/auth/refresh` | – | Exchange refresh token for new access token |
| POST | `/v1/auth/logout` | Bearer | Revoke current session |
| POST | `/v1/auth/forgot-password` | – | Start password reset |
| POST | `/v1/auth/reset-password` | – | Complete password reset |
| POST | `/v1/auth/oauth/:provider` | – | Apple/Google code exchange |
| POST | `/v1/auth/passkey/register` | Bearer | Register a WebAuthn passkey |
| POST | `/v1/auth/passkey/authenticate` | – | Passkey assertion login |
| POST | `/v1/auth/mfa/enroll` | Bearer | Enroll TOTP MFA |
| POST | `/v1/auth/mfa/verify` | – | Verify MFA challenge |
| GET | `/v1/auth/me` | Bearer | Current user + profile + roles |
| GET | `/v1/users/:id` | Bearer (RBAC) | Fetch a user (self or admin) |
| PATCH | `/v1/profile` | Bearer | Update own profile |
| GET | `/v1/sessions` | Bearer | List active sessions |
| DELETE | `/v1/sessions/:id` | Bearer | Revoke a specific session |

---

## OpenAPI (excerpt — core auth flows)

```yaml
openapi: 3.1.0
info:
  title: CinneTemple API
  version: 1.0.0
  description: Authentication & identity surface (Phase 1).
servers:
  - url: https://api.cinnetemple.com
  - url: http://localhost:4000
paths:
  /v1/auth/register:
    post:
      tags: [Auth]
      summary: Register a new user
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RegisterRequest' }
      responses:
        '201':
          description: Created — verification email sent
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RegisterResponse' }
        '409': { description: Email already registered }
        '422': { description: Validation error }
  /v1/auth/login:
    post:
      tags: [Auth]
      summary: Authenticate with email & password
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LoginRequest' }
      responses:
        '200':
          description: Authenticated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TokenPair' }
        '401': { description: Invalid credentials }
        '403': { description: MFA required or email unverified }
  /v1/auth/refresh:
    post:
      tags: [Auth]
      summary: Refresh access token
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RefreshRequest' }
      responses:
        '200':
          description: New token pair
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TokenPair' }
        '401': { description: Invalid or revoked refresh token }
  /v1/auth/me:
    get:
      tags: [Auth]
      summary: Get the authenticated user
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Current principal
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MeResponse' }
        '401': { description: Unauthorized }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    RegisterRequest:
      type: object
      required: [email, password, displayName]
      properties:
        email: { type: string, format: email }
        password: { type: string, minLength: 8, format: password }
        displayName: { type: string, minLength: 2, maxLength: 60 }
    RegisterResponse:
      type: object
      properties:
        userId: { type: string, format: uuid }
        status: { type: string, example: PENDING_VERIFICATION }
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string, format: password }
        deviceId: { type: string }
    RefreshRequest:
      type: object
      required: [refreshToken]
      properties:
        refreshToken: { type: string }
    TokenPair:
      type: object
      properties:
        accessToken: { type: string }
        refreshToken: { type: string }
        tokenType: { type: string, example: Bearer }
        expiresIn: { type: integer, example: 900 }
    MeResponse:
      type: object
      properties:
        id: { type: string, format: uuid }
        email: { type: string, format: email }
        emailVerified: { type: boolean }
        roles:
          type: array
          items: { type: string }
        profile:
          type: object
          properties:
            displayName: { type: string }
            avatarUrl: { type: string, nullable: true }
            locale: { type: string }
```

The complete, always-current spec is generated from the NestJS decorators; run
the backend and open `/docs` (Swagger UI) or `/docs-json` (raw OpenAPI).
