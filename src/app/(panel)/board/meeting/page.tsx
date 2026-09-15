import { redirect } from "next/navigation";

export default function MeetingRedirect() {
  redirect("/board#meeting");
}
