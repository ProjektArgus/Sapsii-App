import { Dashboard } from "@/components/dashboard";
import { getDashboardData } from "@/lib/api";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const data = await getDashboardData();
  return <Dashboard data={data} />;
}
