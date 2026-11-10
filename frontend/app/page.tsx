import { redirect } from "next/navigation";

export default function Home(): null {
  redirect("/dashboard");
}
