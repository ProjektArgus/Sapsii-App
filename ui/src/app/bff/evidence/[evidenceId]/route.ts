import { getEvidenceFrame } from "@/lib/api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await params;
  if (!UUID_PATTERN.test(evidenceId)) {
    return Response.json({ code: "INVALID_EVIDENCE_ID" }, { status: 400 });
  }

  try {
    const upstream = await getEvidenceFrame(evidenceId);
    const contentType = upstream.headers.get("content-type")?.split(";", 1)[0];
    if (contentType !== "image/jpeg") {
      return Response.json({ code: "UNSUPPORTED_EVIDENCE_TYPE" }, { status: 415 });
    }
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${evidenceId}.jpg"`,
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return Response.json({ code: "EVIDENCE_UNAVAILABLE" }, { status: 502 });
  }
}
