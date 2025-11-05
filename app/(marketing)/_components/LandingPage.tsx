import Image from "next/image";
import Link from "next/link";

import "../lp.css";

import { ClosingSection } from "./ClosingSection";
import { FAQAccordion, type FAQItem } from "./FAQAccordion";
import { FloatingCTA } from "./FloatingCTA";
import { HeroSection } from "./HeroSection";
import { ScrollAnimations } from "./ScrollAnimations";

const faqItems: FAQItem[] = [
  {
    question: "利用料金はいくらですか？",
    answer:
      "基本料金はありません。オンライン決済された参加費に対し、プラットフォーム利用手数料(1.3%)を申し受けます。 なお、上記手数料とは別に、決済代行会社の手数料(3.6%)が差し引かれます。",
  },
  {
    question: "参加者にアカウント作成は必要ですか？",
    answer: "いいえ。主催者から届いたURLにアクセスして回答するだけです。",
  },
  {
    question: "現金とオンラインの両方で集金できますか？",
    answer: "はい。現金の場合は対面で集金する必要がありますが、入金状況を1つの画面で管理できます。",
  },
  {
    question: "リマインドのタイミングは？",
    answer:
      "参加締切、オンライン決済締切、イベント開催日を設定している場合、それぞれ前日の午前9時頃に自動でリマインドメールが送信されます。",
  },
  {
    question: "CSVなどでデータをエクスポートできますか？",
    answer: "はい。出欠・入金データをCSVでエクスポートできます。",
  },
];

export default function LandingPage(): JSX.Element {
  return (
    <div data-lp>
      <HeroSection
        title={
          <>
            出欠から集金まで、
            <br />
            ひとつのリンクで完了。
          </>
        }
        description={
          <>
            参加の確認から集金まで、リンクの共有だけで完了できる新しいイベント管理 &
            集金ツールです。
            <br />
            いつもの集金を、キャッシュレスにしませんか?
          </>
        }
        chips={["参加者はアカウント不要", "現金・オンライン決済対応", "自動リマインド"]}
        ctaText="無料でイベントを作成"
        microCopy="メールアドレスだけ、30秒で完了"
        imageSrc="/images/marketing/hero/mobile-flow-demo.png"
        imageAlt="スマホ画面から紙飛行機が飛んでいるイラスト"
      />

      <section className="problems" id="problems">
        <div className="container">
          <h2 className="section-title">こんな集金のストレスはありませんか？</h2>
          <div className="problems-grid">
            <div className="problem-card">
              <Image
                src="/images/marketing/problems/line-chaos.png"
                alt="LINEの返信が散らばる"
                className="problem-img"
                width={160}
                height={160}
                loading="lazy"
                sizes="(max-width: 768px) 160px, 200px"
              />
              <h3 className="problem-title">LINEの返事が散らばる</h3>
              <p className="problem-text">誰が参加かは結局スプレッドシートで手入力。</p>
            </div>
            <div className="problem-card">
              <Image
                src="/images/marketing/problems/cash-burden.png"
                alt="現金回収が負担"
                className="problem-img"
                width={160}
                height={160}
                loading="lazy"
                sizes="(max-width: 768px) 160px, 200px"
              />
              <h3 className="problem-title">集金作業が負担</h3>
              <p className="problem-text">
                集める/お釣り/立替/ドタキャン…集計作業で時間を消費。未払いの確認も気まずい。
              </p>
            </div>
            <div className="problem-card">
              <Image
                src="/images/marketing/problems/manual-reminder.png"
                alt="リマインドが手作業"
                className="problem-img"
                width={160}
                height={160}
                loading="lazy"
                sizes="(max-width: 768px) 160px, 200px"
              />
              <h3 className="problem-title">リマインドが手作業</h3>
              <p className="problem-text">未回答者へメッセージ。週末の時間が消えていく。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="container">
          <h2 className="section-title">1本の招待リンクで、準備〜集金まで自動化</h2>

          <div className="feature">
            <div className="feature-content">
              <div className="feature-text">
                <span className="feature-label">かんたん共有</span>
                <h3 className="feature-title">参加者はワンタップ回答、登録不要。</h3>
                <p className="feature-description">
                  イベント作成→URL発行→LINEやSNSで送るだけ。参加者はリンクから回答するだけ。
                </p>
              </div>
              <div className="feature-image">
                <Link href="/images/marketing/features/sns-sharing.png" target="_blank">
                  <Image
                    src="/images/marketing/features/sns-sharing.png"
                    alt="招待リンクをSNSで共有"
                    className="feature-img"
                    width={1080}
                    height={720}
                    loading="lazy"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 864px"
                  />
                </Link>
              </div>
            </div>
          </div>

          <div className="feature feature-reverse">
            <div className="feature-content">
              <div className="feature-text">
                <span className="feature-label">一元管理</span>
                <h3 className="feature-title">現金・オンラインの入金をまとめて可視化。</h3>
                <p className="feature-description">
                  当日の現金回収も、事前のオンライン決済も1画面で管理。未払いだけを自動で抽出できます。
                </p>
              </div>
              <div className="feature-image">
                <Link href="/images/marketing/features/dashboard-overview.png" target="_blank">
                  <Image
                    src="/images/marketing/features/dashboard-overview.png"
                    alt="現金・オンライン決済の一元管理ダッシュボード"
                    className="feature-img"
                    width={1080}
                    height={720}
                    loading="lazy"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 864px"
                  />
                </Link>
              </div>
            </div>
          </div>

          <div className="feature">
            <div className="feature-content">
              <div className="feature-text">
                <span className="feature-label">自動リマインド</span>
                <h3 className="feature-title">未定・未払いにだけ、自動でリマインド。</h3>
                <p className="feature-description">
                  締切前に自動でリマインド。面倒な催促はもう必要ありません。
                </p>
              </div>
              <div className="feature-image">
                <Image
                  src="/images/marketing/features/notification-settings.png"
                  alt="カレンダーとベルの自動通知"
                  className="feature-img"
                  width={1080}
                  height={720}
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 864px"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="use-cases" id="use-cases">
        <div className="container">
          <h2 className="section-title">合宿、懇親会、地域イベントまで幅広く</h2>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <Image
                src="/images/marketing/use-cases/circle-activities.png"
                alt="大学・社会人サークル"
                className="use-case-img"
                width={200}
                height={200}
                loading="lazy"
                sizes="(max-width: 768px) 200px, 240px"
              />
              <h3 className="use-case-title">大学・社会人サークル</h3>
              <p className="use-case-text">合宿、BBQ、打ち上げ、会費の徴収に。</p>
            </div>
            <div className="use-case-card">
              <Image
                src="/images/marketing/use-cases/pta-community.png"
                alt="PTA・町内会"
                className="use-case-img"
                width={200}
                height={200}
                loading="lazy"
                sizes="(max-width: 768px) 200px, 240px"
              />
              <h3 className="use-case-title">PTA・町内会</h3>
              <p className="use-case-text">バザー/運動会/イベントの準備費や参加費に。</p>
            </div>
            <div className="use-case-card">
              <Image
                src="/images/marketing/use-cases/sports-team.png"
                alt="スポーツチーム"
                className="use-case-img"
                width={200}
                height={200}
                loading="lazy"
                sizes="(max-width: 768px) 200px, 240px"
              />
              <h3 className="use-case-title">スポーツチーム</h3>
              <p className="use-case-text">練習費・遠征費の集金、出欠管理に。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="container">
          <h2 className="section-title">まずは無料でシンプルに利用できます</h2>
          <div className="pricing-card">
            <div className="pricing-item">
              <span className="pricing-label">月額料金</span>
              <span className="pricing-value">0円</span>
            </div>
            <div className="pricing-item highlight">
              <span className="pricing-label">プラットフォーム手数料</span>
              <span className="pricing-value accent">1.3%</span>
            </div>
            <p className="pricing-note">
              ※オンライン決済された参加費に対し、プラットフォーム手数料を申し受けます。現金決済分には手数料はかかりません。
              <br />
              ※オンライン決済の場合、決済代行会社の手数料（3.6%）が別途差し引かれます。
            </p>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="container">
          <h2 className="section-title">よくあるご質問</h2>
          <FAQAccordion items={faqItems} />
        </div>
      </section>

      <ClosingSection title="集金のストレスから解放されましょう!" ctaText="無料でイベントを作成" />

      <FloatingCTA
        text="無料で始める"
        targetSectionId="closing"
        heroSectionId="hero"
        closingSectionId="closing"
      />

      <ScrollAnimations selectors={[".problem-card", ".use-case-card", ".feature"]} />
    </div>
  );
}
