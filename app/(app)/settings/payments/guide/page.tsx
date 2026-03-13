/**
 * Stripe オンボーディング回答参考ページ
 * 静的コンテンツとして提供
 */

import Link from "next/link";

import { BookOpen, Building2, Briefcase, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "設定に迷ったら",
  description: "Stripe設定時に入力する項目と回答の参考",
};

export default function OnboardingGuidePage() {
  const tableData = [
    {
      community: "大学・社会人サークル、\n勉強会、技術コミュニティ",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会費や参加費が中心の運営であり、社会的な任意団体としての実態に最も近い。",
      recommended: true,
    },
    {
      community: "PTA、自治会、NPO等\n（会費中心）",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "会員向けの費用徴収が主目的であり、広義の市民・社会団体として扱うのが一般的。",
    },
    {
      community: "スポーツチーム、\nレクリエーション系サークル",
      category: "会員制組織 > 市民、友愛または社会団体",
      note: "メンバーシップに基づいた内部的な費用徴収が主であり、会員制組織としての分類が実態に一致しやすい。",
    },
    {
      community: "不特定多数向けの公開\nチケット販売が主な場合",
      category: "エンターテイメント、レクリエーション > イベントチケット代理店",
      note: "入場券や参加券の一般販売に該当する可能性が高い。",
    },
    {
      community: "個人のワークショップ・講座",
      category: "教育 > その他の教育サービス",
      note: "参加費を伴う講座やレッスン等の教育サービスとして分類するのが一般的。",
    },
    {
      community: "上記に当てはまらない・\n迷う場合",
      category: "近いグループの「その他」を選択\n（例：会員制組織 > その他）",
      note: "一覧にない場合は、最も近いカテゴリ内の「その他」を選択してください。",
    },
  ];

  return (
    <div className="relative min-h-screen bg-transparent">
      {/* 背景の装飾的な要素 */}
      <div className="absolute top-0 right-0 -z-10 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 -z-10 h-[400px] w-[400px] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      <div className="container mx-auto py-4 sm:py-8 space-y-8 max-w-5xl">
        {/* ヘッダーセクション */}

        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 relative z-10">
          <div className="p-3 bg-primary/20 rounded-xl shadow-inner">
            <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              設定に迷ったら
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Stripeアカウント作成時に入力する項目と設定の参考です。
              スムーズなオンボーディングのために、以下のガイドを参考にしてください。
            </p>
          </div>
        </div>

        <div className="grid gap-8">
          {/* セクション1: ビジネスの詳細 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold">「ビジネスの詳細」について</h2>
            </div>

            <Card className="border-primary/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="bg-muted/30 pb-4">
                <CardTitle className="text-lg">業種の選択</CardTitle>
                <CardDescription>
                  コミュニティの主な活動内容に合わせて、最も近いものを選択してください。
                  多くの場合、「<span className="font-semibold text-foreground">会員制組織</span>
                  」カテゴリが該当します。
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {/* モバイル: カード形式 */}
                <div className="md:hidden divide-y divide-border">
                  {tableData.map((row, index) => (
                    <div
                      key={index}
                      className="p-4 space-y-3 bg-card hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-bold text-sm whitespace-pre-line">{row.community}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                          Stripe業種カテゴリ
                        </div>
                        <div className="text-sm font-semibold text-primary">{row.category}</div>
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {row.note}
                      </div>
                    </div>
                  ))}
                </div>

                {/* デスクトップ: テーブル形式 */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[30%]">コミュニティの種類</TableHead>
                        <TableHead className="w-[35%]">Stripe業種カテゴリ</TableHead>
                        <TableHead className="w-[35%]">備考</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row, index) => (
                        <TableRow key={index} className="group transition-colors">
                          <TableCell className="font-medium align-top py-4">
                            <div className="flex items-start gap-2">
                              <span className="whitespace-pre-line leading-relaxed">
                                {row.community}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <code className="text-sm font-semibold text-primary bg-primary/5 px-2 py-1 rounded">
                              {row.category}
                            </code>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground leading-relaxed align-top py-4">
                            {row.note}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 mt-6">
              <Card className="border-primary/10 hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    ウェブサイト
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <div className="space-y-2">
                    <p className="font-semibold text-foreground">ウェブサイトをお持ちの場合</p>
                    <p>団体の公式サイトや活動内容を紹介するページのURLを入力してください。</p>
                    <div className="bg-muted p-2 rounded flex items-center gap-2 group cursor-default">
                      <code className="text-xs truncate">https://example.com</code>
                    </div>
                  </div>
                  <div className="pt-2 space-y-2 border-t border-border/50">
                    <p className="font-semibold text-foreground">お持ちでない場合</p>
                    <p>SNSアカウント（X, Instagram, Facebook等）のURLで問題ありません。</p>
                    <div className="bg-muted p-2 rounded flex items-center gap-2 group cursor-default">
                      <code className="text-xs truncate">https://x.com/your_account</code>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/10 hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-secondary" />
                    商品の詳細
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>どのようなイベントの参加費を受け取るのかを説明する項目です。</p>
                  <p className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg italic leading-relaxed">
                    「イベントを運営しています。イベントの参加者が参加費を支払う際、イベント管理プラットフォームのみんなの集金を使って参加費が決済されます。」
                  </p>
                  <p className="text-xs">
                    ※あらかじめ入力されていますが、ご自身の活動内容に合わせて自由に編集・追記して問題ありません。
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* セクション2: 事業形態 */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold">事業形態について</h2>
            </div>

            <div className="grid gap-6">
              <Alert
                variant="info"
                className="bg-blue-50/50 border-blue-200 shadow-sm overflow-hidden relative"
              >
                <AlertDescription className="text-blue-800 space-y-2">
                  <p>
                    サークル活動や単発のイベント開催など、法人格を持たないほとんどの場合は
                    <strong>「個人事業主」</strong>を選択してください。
                  </p>
                  <p className="text-sm opacity-80 decoration-blue-300 underline-offset-4 decoration-dashed underline">
                    営利目的でないイベントの場合も「個人事業主」として担当者個人の名義で登録を進めることができます。
                  </p>
                </AlertDescription>
              </Alert>

              <Card className="border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">法人や非営利組織の場合</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    一般社団法人、NPO法人、株式会社などの法人格をお持ちの場合は、
                    <Badge variant="outline" className="mx-1">
                      法人
                    </Badge>{" "}
                    または
                    <Badge variant="outline" className="mx-1">
                      非営利組織
                    </Badge>
                    を選択し、画面の案内に沿って登録を進めてください。
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* 戻るボタン */}
          <div className="flex justify-center pt-8 border-t border-border/40">
            <Link
              href="/settings/payments"
              className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              決済設定に戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
