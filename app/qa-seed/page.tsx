import { notFound } from "next/navigation";
import { QaSeedControl } from "@/components/qa-seed-control";

export default function QaSeedPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <QaSeedControl />;
}
