/**
 * Stripe オンボーディング回答参考ページ
 * 静的コンテンツとして提供
 */

import Link from "next/link";

import { ArrowLeft, BookOpen, Building2, Briefcase } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
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
    <div className="container mx-auto py-4 sm:py-8 px-4 max-w-4xl">
      <div className="space-y-6 sm:space-y-8">
        {/* ヘッダー */}
        <div className="space-y-2">
          <Link href="/dashboard/connect">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              売上受取設定に戻る
            </Button>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold">設定に迷ったら</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Stripeアカウント作成時に入力する項目と設定の参考です。設定時に迷ったら参考にしてください。
              </p>
            </div>
          </div>
        </div>

        {/* セクション1: ビジネスの詳細 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              「ビジネスの詳細」について
            </CardTitle>
            <CardDescription>
              あなたのコミュニティやイベントの活動内容について入力します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">業種の選択</h3>
              <p className="text-sm text-muted-foreground">
                業種の選択が必要な場合、コミュニティの主な活動内容に合わせて、最も近いものを選択してください。以下の表を参考にできます。
                多くの場合、「<strong>会員制組織</strong>」カテゴリが該当します。
              </p>

              {/* モバイル: カード形式 */}
              <div className="md:hidden space-y-4">
                {tableData.map((row, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3 bg-card">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        コミュニティの種類
                      </div>
                      <div className="font-medium whitespace-pre-line">{row.community}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">
                        Stripe業種カテゴリ
                      </div>
                      <div className="whitespace-pre-line">
                        <strong>{row.category}</strong>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">備考</div>
                      <div className="text-sm text-muted-foreground">{row.note}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* デスクトップ: テーブル形式 */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">コミュニティの種類</TableHead>
                      <TableHead className="min-w-[250px]">Stripe業種カテゴリ</TableHead>
                      <TableHead>備考</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium whitespace-pre-line">
                          {row.community}
                        </TableCell>
                        <TableCell>
                          <strong>{row.category}</strong>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">ウェブサイト</h3>
              <p className="text-sm text-muted-foreground">
                ウェブサイトの入力が必要な場合は、活動がわかるページのURLを入力します。
              </p>

              <ul className="space-y-3 sm:space-y-4 pl-5 text-sm text-muted-foreground list-disc">
                <li className="space-y-1">
                  <div>
                    <span className="font-medium text-foreground">ウェブサイトをお持ちの場合</span>
                  </div>
                  <div>団体の公式サイトや活動内容を紹介するページのURLを入力してください。</div>
                  <div>
                    例：
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1 break-all">
                      https://example.com
                    </code>
                  </div>
                </li>
                <li className="space-y-1">
                  <div>
                    <span className="font-medium text-foreground">
                      ウェブサイトをお持ちでない場合
                    </span>
                  </div>
                  <div>
                    <strong className="text-foreground">
                      SNSアカウントのURLで問題ありません。
                    </strong>
                  </div>
                  <div>X、Instagram、Facebookなどの公開アカウントのURLを入力してください。</div>
                  <div>
                    例：
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1 break-all">
                      https://x.com/your_account_id
                    </code>
                  </div>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">商品の詳細</h3>
              <p className="text-sm text-muted-foreground">
                どのようなイベントの参加費を受け取るのかを説明する項目です。
                <br />
                あらかじめ入力されていますが、ご自身の活動内容に合わせて自由に編集・追記して問題ありません。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* セクション2: 事業形態 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              事業形態について
            </CardTitle>
            <CardDescription>
              あなたの活動の形態に最も近いものを選択します。
              <br />
              この項目はあらかじめ「個人事業主」が選択されていますが、法人や非営利組織の場合は「事業形態」の項目から変更することができます。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">
                  ほとんどの場合、個人事業主 を選択すればスムーズに登録を進めることができます。
                </p>
                <p className="text-sm text-blue-800">
                  サークル活動や単発のイベント開催など、法人格を持たないほとんどの場合は
                  <strong>個人事業主</strong>を選択してください。
                  <br />
                  担当者個人の名義で登録を進めることができます。
                </p>
                <p className="text-sm text-blue-800 mt-2">
                  営利目的でないイベントの場合も「個人事業主」で問題ありません。
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">法人や非営利組織の場合</h3>
              <p className="text-sm text-muted-foreground">
                一般社団法人、NPO法人、株式会社などの法人格をお持ちの場合は、「<strong>法人</strong>
                」または「<strong>非営利組織</strong>
                」を選択し、画面の案内に沿って法人情報や代表者情報を入力してください。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
