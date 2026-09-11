# Infrastructure adapters

Concrete integrations belong here and implement interfaces from `src/core/ports`.

Examples include PostgreSQL repositories, OIDC/JWKS human authentication, hashed device credentials, and S3-compatible evidence storage. Domain modules must depend on ports, never directly on a hosting provider SDK.
