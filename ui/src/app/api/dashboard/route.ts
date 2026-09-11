import { getDashboardData } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDashboardData();
  return Response.json(data, {
    status: data.error ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
