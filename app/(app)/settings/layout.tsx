"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ArrowRight, Building2, CreditCard, Shield, User } from "lucide-react";

import { cn } from "@/components/ui/_lib/cn";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const settingsPages = [
  {
    title: "コミュニティ",
    href: "/settings/community",
    icon: Building2,
    description: "選択中のコミュニティの設定",
  },
  {
    title: "オンライン集金",
    href: "/settings/payments",
    icon: CreditCard,
    description: "受取先設定と集金・振込状況の確認",
  },
  {
    title: "アカウント",
    href: "/settings/profile",
    icon: User,
    description: "アカウント情報の変更",
  },
  {
    title: "パスワード",
    href: "/settings/security",
    icon: Shield,
    description: "パスワードの変更",
  },
];

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";
  const currentPage = settingsPages.find((page) => pathname === page.href);

  if (isSettingsRoot) {
    return (
      <div className="flex w-full flex-col gap-3 px-2 pb-6 pt-3 sm:gap-8 sm:p-6">
        <header className="hidden border-b border-border/60 pb-6 sm:block">
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">設定</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            コミュニティ、オンライン集金、アカウント情報を管理します。
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {settingsPages.map((page) => (
            <SettingsHomeLink key={page.href} page={page} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-0 grid w-full gap-4 lg:mt-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:sticky lg:top-[calc(3.5rem+1rem)] lg:block lg:self-start">
        <div className="flex flex-col gap-2 border-b border-border/60 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
          <p className="px-2 text-xs font-medium text-muted-foreground">設定</p>
          <nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1" aria-label="設定メニュー">
            {settingsPages.map((page) => (
              <SettingsNavLink key={page.href} page={page} active={pathname === page.href} />
            ))}
          </nav>
        </div>
      </aside>

      <section className="min-w-0 px-2 pb-8 pt-3 sm:px-0 sm:pt-0 lg:pb-0">
        {currentPage ? (
          <header className="mb-8 hidden border-b border-border/60 pb-6 lg:block">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{currentPage.title}</h1>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {currentPage.description}
                </p>
              </div>
            </div>
          </header>
        ) : null}
        <div className="max-w-3xl">{children}</div>
      </section>
    </div>
  );
}

type SettingsPageConfig = (typeof settingsPages)[number];

function SettingsHomeLink({ page }: { page: SettingsPageConfig }) {
  const Icon = page.icon;

  return (
    <Link
      href={page.href}
      className="group flex min-h-[5.25rem] items-start gap-3 rounded-lg border border-border/60 bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:gap-4 sm:p-5"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary sm:size-10">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{page.title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {page.description}
        </span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none" />
    </Link>
  );
}

function SettingsNavLink({ page, active }: { page: SettingsPageConfig; active: boolean }) {
  const Icon = page.icon;

  return (
    <Link
      href={page.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-muted text-foreground" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center transition-colors",
          active
            ? "border-primary/30 text-primary"
            : "border-border/60 text-muted-foreground group-hover:text-foreground"
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="truncate font-medium">{page.title}</span>
    </Link>
  );
}
