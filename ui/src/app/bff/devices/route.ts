import { getLiveDevices } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { items: await getLiveDevices() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load live device positions" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
