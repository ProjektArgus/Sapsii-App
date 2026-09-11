import { getIssue } from "@/lib/api";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ issueId: string }> },
) {
  const { issueId } = await params;
  if (!UUID_PATTERN.test(issueId)) {
    return Response.json({ code: "INVALID_ISSUE_ID" }, { status: 400 });
  }

  try {
    return Response.json(await getIssue(issueId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load issue details" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
