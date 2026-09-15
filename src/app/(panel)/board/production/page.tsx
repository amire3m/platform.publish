import { redirect } from "next/navigation";

export default function ProductionRedirect() {
  redirect("/board#production");
}
