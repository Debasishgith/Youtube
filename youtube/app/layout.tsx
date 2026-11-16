import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/ui/Header";
import Sidebar from "@/components/ui/Sidebar";
import { UserProvider } from "@/lib/authContext";
import { SocketProvider } from "@/lib/socket";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My-Youtube",
  description: "A streaming platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <UserProvider>
        <SocketProvider>
          <body className="min-h-screen bg-background text-foreground">
            <Header />
            <div className="flex">
              <Sidebar />
              {children}
            </div>
          </body>
        </SocketProvider>
      </UserProvider>
    </html>
  );
}
