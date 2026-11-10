import "./globals.css";
import { Nav } from "../components/Nav";

export const metadata = {
  title: "EV Battery Degradation Platform",
  description: "LSTM-VAE powered anomaly detection and scenario generation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="layout">
          <Nav />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
