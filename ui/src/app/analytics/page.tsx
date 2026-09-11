import { Analytics } from "@/components/analytics";
import { getDashboardData } from "@/lib/api";
import { connection } from "next/server";

export default async function AnalyticsPage() {
  await connection();
  return <Analytics data={await getDashboardData()} />;
}
