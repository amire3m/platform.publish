import { redirect } from "next/navigation";

export default function ArchiveRedirect() {
  redirect("/board#archive");
}
