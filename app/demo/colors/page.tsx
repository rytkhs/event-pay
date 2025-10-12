"use client";

import { useState } from "react";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Home,
  Info,
  Lock,
  LogOut,
  Mail,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipWrapper } from "@/components/ui/tooltip";

interface ColorSwatchProps {
  name: string;
  variable: string;
  description?: string;
}

const ColorSwatch = ({ name, variable, description }: ColorSwatchProps) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(variable);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={copyToClipboard}
        className="group relative flex items-center gap-3 rounded-lg border p-3 transition-all hover:border-primary hover:shadow-md"
      >
        <div
          className={`h-12 w-12 rounded-md border shadow-sm ${variable}`}
          style={{
            backgroundColor: `hsl(var(${variable}))`,
          }}
        />
        <div className="flex-1 text-left">
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted-foreground">{variable}</div>
          {description && <div className="text-xs text-muted-foreground mt-1">{description}</div>}
        </div>
        {copied && (
          <Badge variant="secondary" className="absolute top-2 right-2">
            コピーしました！
          </Badge>
        )}
      </button>
    </div>
  );
};

export default function ColorsDemo() {
  const [darkMode, setDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle("dark");
  };

  const colorGroups = [
    {
      title: "ブランドカラー",
      colors: [
        {
          name: "Primary",
          variable: "--primary",
          description: "ターコイズティール（メインカラー）",
        },
        {
          name: "Primary Foreground",
          variable: "--primary-foreground",
          description: "プライマリ上のテキスト色",
        },
        {
          name: "Secondary",
          variable: "--secondary",
          description: "コーンフラワーブルー（アクセントカラー）",
        },
        {
          name: "Secondary Foreground",
          variable: "--secondary-foreground",
          description: "セカンダリ上のテキスト色",
        },
      ],
    },
    {
      title: "ステータスカラー",
      colors: [
        {
          name: "Success",
          variable: "--success",
          description: "成功・完了状態",
        },
        {
          name: "Success Foreground",
          variable: "--success-foreground",
        },
        {
          name: "Warning",
          variable: "--warning",
          description: "警告・注意状態",
        },
        {
          name: "Warning Foreground",
          variable: "--warning-foreground",
        },
        {
          name: "Info",
          variable: "--info",
          description: "情報・通知",
        },
        {
          name: "Info Foreground",
          variable: "--info-foreground",
        },
        {
          name: "Destructive",
          variable: "--destructive",
          description: "エラー・削除操作",
        },
        {
          name: "Destructive Foreground",
          variable: "--destructive-foreground",
        },
      ],
    },
    {
      title: "背景・サーフェス",
      colors: [
        { name: "Background", variable: "--background", description: "ページ背景" },
        {
          name: "Foreground",
          variable: "--foreground",
          description: "メインテキスト色",
        },
        { name: "Card", variable: "--card", description: "カード背景" },
        {
          name: "Card Foreground",
          variable: "--card-foreground",
          description: "カード内テキスト",
        },
        {
          name: "Popover",
          variable: "--popover",
          description: "ポップオーバー背景",
        },
        {
          name: "Popover Foreground",
          variable: "--popover-foreground",
        },
        { name: "Muted", variable: "--muted", description: "ミュート背景" },
        {
          name: "Muted Foreground",
          variable: "--muted-foreground",
          description: "サブテキスト",
        },
        { name: "Accent", variable: "--accent", description: "アクセント背景" },
        {
          name: "Accent Foreground",
          variable: "--accent-foreground",
        },
      ],
    },
    {
      title: "ボーダー・インタラクティブ",
      colors: [
        { name: "Border", variable: "--border", description: "枠線色" },
        {
          name: "Input",
          variable: "--input",
          description: "入力フィールド枠線",
        },
        {
          name: "Ring",
          variable: "--ring",
          description: "フォーカスリング",
        },
      ],
    },
  ];

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground">カラーパレット検証</h1>
              <p className="mt-2 text-muted-foreground">
                みんなの集金 - ミント×ネイビー カラーシステム
              </p>
            </div>
            <Button onClick={toggleDarkMode} variant="outline" size="lg">
              {darkMode ? (
                <>
                  <Sun className="mr-2 h-5 w-5" />
                  ライトモード
                </>
              ) : (
                <>
                  <Moon className="mr-2 h-5 w-5" />
                  ダークモード
                </>
              )}
            </Button>
          </div>

          {/* Color Swatches */}
          {colorGroups.map((group, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>クリックでCSS変数名をコピーできます</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.colors.map((color, colorIdx) => (
                    <ColorSwatch key={colorIdx} {...color} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Component Examples */}
          <Card>
            <CardHeader>
              <CardTitle>コンポーネント例</CardTitle>
              <CardDescription>実際のUIコンポーネントでの使用例</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Buttons */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">ボタン</h3>
                <div className="flex flex-wrap gap-3">
                  <Button variant="default">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="link">Link</Button>
                </div>
              </div>

              {/* Badges */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">バッジ</h3>
                <div className="flex flex-wrap gap-3">
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Secondary</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </div>

              {/* Alerts */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">アラート</h3>
                <div className="space-y-4">
                  <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>成功</AlertTitle>
                    <AlertDescription>操作が正常に完了しました</AlertDescription>
                  </Alert>

                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>警告</AlertTitle>
                    <AlertDescription>この操作には注意が必要です</AlertDescription>
                  </Alert>

                  <Alert variant="info">
                    <Info className="h-4 w-4" />
                    <AlertTitle>情報</AlertTitle>
                    <AlertDescription>お知らせがあります</AlertDescription>
                  </Alert>

                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>エラー</AlertTitle>
                    <AlertDescription>問題が発生しました。もう一度お試しください</AlertDescription>
                  </Alert>

                  <Separator className="my-4" />
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                    実際の使用例（/settings/payments より）
                  </h4>

                  {/* 要件不備アラート（destructive） */}
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>アカウント情報の更新が必要です。</strong>{" "}
                      Stripeの案内に従って、本人確認書類や入金口座などの不足情報を入力してください。
                    </AlertDescription>
                  </Alert>

                  {/* 要件不備アラート（default） */}
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>アカウント情報の更新が必要です。</strong>{" "}
                      Stripeの案内に従って、本人確認書類や入金口座などの不足情報を入力してください。
                    </AlertDescription>
                  </Alert>

                  {/* 設定完了アラート（success） */}
                  <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      <strong>設定完了！</strong> Stripeでの入金設定が完了しました。
                      オンライン決済が有効化されました。
                    </AlertDescription>
                  </Alert>
                </div>
              </div>

              {/* Cards */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">カード</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle>通常カード</CardTitle>
                      <CardDescription>標準のカードコンポーネント</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">これはカードの本文です。</p>
                    </CardContent>
                  </Card>

                  <Card className="border-primary">
                    <CardHeader>
                      <CardTitle className="text-primary">プライマリカード</CardTitle>
                      <CardDescription>強調表示されたカード</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">重要な情報を表示します。</p>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted">
                    <CardHeader>
                      <CardTitle>ミュートカード</CardTitle>
                      <CardDescription>背景色が異なるカード</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">控えめな表示です。</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Elements */}
          <Card>
            <CardHeader>
              <CardTitle>フォーム要素</CardTitle>
              <CardDescription>入力フォームとインタラクティブ要素</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Inputs */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">入力フィールド</h3>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@example.com"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">パスワード</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="success-input" className="text-success">
                      成功状態
                    </Label>
                    <Input
                      id="success-input"
                      placeholder="入力成功"
                      className="border-success focus-visible:ring-success"
                    />
                    <p className="text-xs text-success">✓ 入力内容が正しいです</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="error-input" className="text-destructive">
                      エラー状態
                    </Label>
                    <Input
                      id="error-input"
                      placeholder="入力エラー"
                      className="border-destructive focus-visible:ring-destructive"
                    />
                    <p className="text-xs text-destructive">× この項目は必須です</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="disabled-input">無効状態</Label>
                    <Input id="disabled-input" placeholder="無効な入力" disabled />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Textarea */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">テキストエリア</h3>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="description">説明</Label>
                    <Textarea
                      id="description"
                      placeholder="イベントの詳細を入力してください..."
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Checkboxes and Radio */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">チェックボックス・ラジオボタン</h3>
                <div className="grid gap-6 sm:grid-cols-2 max-w-2xl">
                  <div className="space-y-3">
                    <Label>チェックボックス</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="terms" defaultChecked />
                        <label htmlFor="terms" className="text-sm cursor-pointer">
                          利用規約に同意する
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="newsletter" />
                        <label htmlFor="newsletter" className="text-sm cursor-pointer">
                          ニュースレターを受け取る
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="disabled-checkbox" disabled />
                        <label
                          htmlFor="disabled-checkbox"
                          className="text-sm text-muted-foreground"
                        >
                          無効なオプション
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>ラジオボタン</Label>
                    <RadioGroup defaultValue="option1">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="option1" id="option1" />
                        <Label htmlFor="option1" className="cursor-pointer">
                          オプション 1
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="option2" id="option2" />
                        <Label htmlFor="option2" className="cursor-pointer">
                          オプション 2
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="option3" id="option3" />
                        <Label htmlFor="option3" className="cursor-pointer">
                          オプション 3
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Select */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">セレクト</h3>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="select-demo">支払い方法を選択</Label>
                    <Select>
                      <SelectTrigger id="select-demo">
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit-card">クレジットカード</SelectItem>
                        <SelectItem value="bank-transfer">銀行振込</SelectItem>
                        <SelectItem value="convenience-store">コンビニ決済</SelectItem>
                        <SelectItem value="paypay">PayPay</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Toggle */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">トグル</h3>
                <div className="flex flex-wrap gap-3">
                  <Toggle>通常</Toggle>
                  <Toggle defaultPressed>選択済み</Toggle>
                  <Toggle disabled>無効</Toggle>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation & Interactive */}
          <Card>
            <CardHeader>
              <CardTitle>ナビゲーション・インタラクティブ要素</CardTitle>
              <CardDescription>
                メニュー、タブ、その他のインタラクティブコンポーネント
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Breadcrumb */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">パンくずリスト</h3>
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#" className="flex items-center">
                        <Home className="h-4 w-4" />
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#">イベント</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>詳細</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <Separator />

              {/* Dropdown Menu */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">ドロップダウンメニュー</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <User className="mr-2 h-4 w-4" />
                      メニューを開く
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>マイアカウント</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <User className="mr-2 h-4 w-4" />
                      プロフィール
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Settings className="mr-2 h-4 w-4" />
                      設定
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      ログアウト
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Separator />

              {/* Tabs */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">タブ</h3>
                <Tabs defaultValue="overview" className="w-full max-w-2xl">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="overview">概要</TabsTrigger>
                    <TabsTrigger value="details">詳細</TabsTrigger>
                    <TabsTrigger value="settings">設定</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      概要タブの内容がここに表示されます。イベントの基本情報や統計情報など。
                    </p>
                  </TabsContent>
                  <TabsContent value="details" className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      詳細タブの内容がここに表示されます。参加者リストや支払い状況など。
                    </p>
                  </TabsContent>
                  <TabsContent value="settings" className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      設定タブの内容がここに表示されます。イベント設定やプライバシー設定など。
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              <Separator />

              {/* Tooltip */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">ツールチップ</h3>
                <Tooltip>
                  <div className="flex flex-wrap gap-4">
                    <TooltipWrapper>
                      <TooltipTrigger asChild>
                        <Button variant="outline">デフォルト</Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>これはツールチップです</p>
                      </TooltipContent>
                    </TooltipWrapper>

                    <TooltipWrapper>
                      <TooltipTrigger asChild>
                        <Button variant="outline">
                          <Info className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>詳細情報を表示</p>
                      </TooltipContent>
                    </TooltipWrapper>
                  </div>
                </Tooltip>
              </div>

              <Separator />

              {/* Dialog */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">ダイアログ</h3>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>ダイアログを開く</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>確認が必要です</DialogTitle>
                      <DialogDescription>
                        この操作を実行してもよろしいですか？この操作は取り消すことができません。
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline">キャンセル</Button>
                      <Button>実行</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Data Display */}
          <Card>
            <CardHeader>
              <CardTitle>データ表示</CardTitle>
              <CardDescription>進捗、テーブル、ローディング状態</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Progress */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">進捗バー</h3>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>支払い完了</span>
                      <span className="text-muted-foreground">25%</span>
                    </div>
                    <Progress value={25} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>参加者数</span>
                      <span className="text-muted-foreground">60%</span>
                    </div>
                    <Progress value={60} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>完了</span>
                      <span className="text-success">100%</span>
                    </div>
                    <Progress value={100} className="h-2" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Skeleton */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">スケルトン（ローディング）</h3>
                <div className="space-y-4 max-w-md">
                  <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </div>
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>

              <Separator />

              {/* Table */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">テーブル</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>参加者</TableHead>
                        <TableHead>ステータス</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">山田太郎</TableCell>
                        <TableCell>
                          <Badge className="bg-success text-success-foreground">支払済</Badge>
                        </TableCell>
                        <TableCell className="text-right">¥3,000</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">佐藤花子</TableCell>
                        <TableCell>
                          <Badge className="bg-warning text-warning-foreground">保留中</Badge>
                        </TableCell>
                        <TableCell className="text-right">¥3,000</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">鈴木次郎</TableCell>
                        <TableCell>
                          <Badge variant="secondary">未払い</Badge>
                        </TableCell>
                        <TableCell className="text-right">¥3,000</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">田中美咲</TableCell>
                        <TableCell>
                          <Badge className="bg-success text-success-foreground">支払済</Badge>
                        </TableCell>
                        <TableCell className="text-right">¥3,000</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
