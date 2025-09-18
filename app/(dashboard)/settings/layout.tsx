"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { User, CreditCard, Shield } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  // パスからアクティブなタブを決定
  const getActiveTab = () => {
    if (pathname.includes("/profile")) return "profile";
    if (pathname.includes("/payments")) return "payments";
    if (pathname.includes("/security")) return "security";
    return "profile";
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">設定</h1>
        <p className="text-muted-foreground">アカウント設定を管理します</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardContent className="p-0">
            <Tabs value={getActiveTab()} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profile" asChild>
                  <Link href="/settings/profile" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    プロフィール
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="payments" asChild>
                  <Link href="/settings/payments" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    支払い設定
                  </Link>
                </TabsTrigger>
                <TabsTrigger value="security" asChild>
                  <Link href="/settings/security" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    セキュリティ
                  </Link>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <div className="min-h-[400px]">{children}</div>
      </div>
    </div>
  );
}
