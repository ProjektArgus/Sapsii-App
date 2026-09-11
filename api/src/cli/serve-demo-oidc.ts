import { createServer } from "node:http";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const issuer = new URL(required("OIDC_ISSUER"));
const encodedJwk = required("DEMO_OIDC_PUBLIC_JWK_BASE64");
const jwk = JSON.parse(Buffer.from(encodedJwk, "base64url").toString("utf8")) as Record<string, unknown>;
const jwks = JSON.stringify({ keys: [jwk] });
const host = issuer.hostname;
const port = Number(issuer.port || (issuer.protocol === "https:" ? 443 : 80));

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("OIDC_ISSUER must contain a valid port");
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/.well-known/jwks.json") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(jwks);
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(port, host, () => console.log(`Demo OIDC JWKS listening at ${issuer.origin}`));
