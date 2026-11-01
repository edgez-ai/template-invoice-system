import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Ledgerly — Invoice operations",
  description: "Private customer, project, quotation and invoicing workspace"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
