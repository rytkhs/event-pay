import Link from "next/link";
import { notFound } from "next/navigation";

import { Mail, FileText, CalendarDays } from "lucide-react";
import { Metadata } from "next";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { getPublicCommunityBySlug } from "@features/communities/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    return {
      title: "Not Found",
      robots: "noindex, nofollow",
    };
  }

  const community = result.data;

  return {
    title: community.name,
    description: community.description || `${community.name}のコミュニティページです。`,
    robots: "noindex, nofollow",
  };
}

export default async function PublicCommunityPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerComponentSupabaseClient();
  const result = await getPublicCommunityBySlug(supabase, slug);

  if (!result.success || !result.data) {
    notFound();
  }

  const community = result.data;

  return (
    <div className="container max-w-2xl py-12 md:py-20 animate-in fade-in duration-500">
      <Card className="border-none shadow-xl bg-background/60 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center">
            <CalendarDays className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">{community.name}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {community.description ? (
            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap leading-relaxed">{community.description}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-center italic">
              説明文はまだ設定されていません。
            </p>
          )}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <Button variant="default" className="w-full gap-2" size="lg" asChild>
              <Link href={`/c/${community.slug}/contact`}>
                <Mail className="h-4 w-4" />
                主催者へ問い合わせる
              </Link>
            </Button>
            <Button variant="outline" className="w-full gap-2" size="lg" asChild>
              <Link href={`/tokushoho/${community.legalSlug}`}>
                <FileText className="h-4 w-4" />
                特定商取引法に基づく表記
              </Link>
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 text-center text-sm text-muted-foreground border-t pt-6">
          <p>このページはStripe審査および利用者への販売主体説明のために公開されています。</p>
        </CardFooter>
      </Card>
    </div>
  );
}
