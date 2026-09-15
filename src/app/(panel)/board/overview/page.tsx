import { redirect } from "next/navigation";

export default function OverviewRedirect() {
  redirect("/board#overview");
}
