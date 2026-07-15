import { redirect } from "next/navigation";
import { getDataMode } from "@/lib/dataMode";
import { getHomePath } from "@/lib/release";

export default function Home() {
  redirect(getHomePath(getDataMode()));
}
