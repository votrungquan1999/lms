import { redirect } from "next/navigation";

/** The old Dashboard address: saved links and bookmarks land on To grade, the teacher's home. */
export default function AdminDashboardPage() {
  redirect("/admin/grading");
}
