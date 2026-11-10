"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["📊", "Dashboard", "/dashboard"],
  ["📁", "Data Explorer", "/data-explorer"],
  ["🔮", "Generative Analysis", "/generative-analysis"],
  ["🚨", "Anomaly Detection", "/anomaly-detection"],
  ["⚙️", "Scenario Simulator", "/scenario-simulator"],
  ["🧪", "Experiment Comparison", "/experiment-comparison"],
  ["🩺", "Battery Report", "/battery-report"],
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">EV Degradation AI</div>
      <nav className="nav">
        {links.map(([icon, label, href]) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""}>
            <span>{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
