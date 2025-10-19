import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

import { logger } from "@core/logging/app-logger";
import { formatUtcToJstByType } from "@core/utils/timezone";

// 画像サイズの定数
const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

// ブランドカラー
const BRAND_COLORS = {
  primary: "#24A6B5",
  secondary: "#3A86FF",
  primaryLight: "#2DBCCD",
  primaryDark: "#1B8694",
  accent: "#FFB800",
  white: "#ffffff",
  dark: "#0b1220",
  gray: "#6b7280",
  overlayLight: "rgba(255, 255, 255, 0.15)",
  overlayDark: "rgba(0, 0, 0, 0.2)",
} as const;

// フォント設定
const FONT_CONFIG = {
  size: {
    hero: 72,
    title: 56,
    subtitle: 28,
    body: 22,
    small: 18,
    tiny: 16,
  },
  weight: {
    bold: 700,
    semibold: 600,
    medium: 500,
    normal: 400,
  },
} as const;

// 型定義
type EventOGProps = {
  eventTitle: string;
  eventDate: string;
  eventLocation?: string | null;
  eventFee: number;
  eventCapacity?: number | null;
};

// 改善されたアイコン - より洗練されたデザイン
function EventPayIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 16 0 Q 24 8, 16 16 Q 8 8, 16 0" fill="#ffffff" opacity="0.95" />
      <path d="M 32 16 Q 24 24, 16 16 Q 24 8, 32 16" fill="#ffffff" opacity="0.75" />
      <path d="M 16 32 Q 8 24, 16 16 Q 24 24, 16 32" fill="#ffffff" opacity="0.55" />
      <path d="M 0 16 Q 8 8, 16 16 Q 8 24, 0 16" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}

// 装飾的な背景要素
function DecorativeBackground() {
  return (
    <>
      <div
        style={{
          position: "absolute",
          top: "-100px",
          right: "-100px",
          width: "400px",
          height: "400px",
          background: `radial-gradient(circle, ${BRAND_COLORS.primaryLight}40 0%, transparent 70%)`,
          borderRadius: "50%",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-150px",
          left: "-150px",
          width: "500px",
          height: "500px",
          background: `radial-gradient(circle, ${BRAND_COLORS.secondary}30 0%, transparent 70%)`,
          borderRadius: "50%",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "10%",
          width: "200px",
          height: "200px",
          background: `radial-gradient(circle, ${BRAND_COLORS.accent}20 0%, transparent 60%)`,
          borderRadius: "50%",
          display: "flex",
        }}
      />
    </>
  );
}

// 視覚的な特徴バッジ
function FeatureBadge({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        background: BRAND_COLORS.overlayLight,
        borderRadius: "24px",
        border: `1px solid ${BRAND_COLORS.overlayLight}`,
        backdropFilter: "blur(10px)",
      }}
    >
      <span style={{ fontSize: "24px" }}>{icon}</span>
      <span
        style={{
          fontSize: FONT_CONFIG.size.small,
          fontWeight: FONT_CONFIG.weight.semibold,
          color: BRAND_COLORS.white,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// トップページ用OG画像 - 大幅改善版
function HomepageOG() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.primaryDark} 50%, ${BRAND_COLORS.secondary} 100%)`,
        fontFamily: '"Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif',
      }}
    >
      <DecorativeBackground />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "60px 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ヘッダー部分 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <EventPayIcon size={56} />
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.subtitle,
              fontWeight: FONT_CONFIG.weight.bold,
              color: BRAND_COLORS.white,
              textShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
            }}
          >
            みんなの集金
          </div>
        </div>

        {/* メインコンテンツ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: "32px",
            marginTop: "-40px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: FONT_CONFIG.size.hero,
                fontWeight: FONT_CONFIG.weight.bold,
                color: BRAND_COLORS.white,
                lineHeight: 1.2,
                textShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                letterSpacing: "-0.02em",
              }}
            >
              出欠から集金まで、
            </div>
            <div
              style={{
                display: "flex",
                fontSize: FONT_CONFIG.size.hero,
                fontWeight: FONT_CONFIG.weight.bold,
                color: BRAND_COLORS.white,
                lineHeight: 1.2,
                textShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                letterSpacing: "-0.02em",
              }}
            >
              ひとつのリンクで完了。
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.subtitle,
              fontWeight: FONT_CONFIG.weight.medium,
              color: BRAND_COLORS.white,
              opacity: 0.95,
              lineHeight: 1.5,
              maxWidth: "700px",
            }}
          >
            参加の確認から集金まで、
            <br />
            リンクの共有だけで完了できる新しいサービスです。
          </div>

          {/* 特徴バッジ */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "8px",
            }}
          >
            <FeatureBadge icon="💳" text="オンライン決済" />
            <FeatureBadge icon="✅" text="出欠管理" />
            <FeatureBadge icon="📊" text="自動集計" />
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.8,
            }}
          >
            シンプル・安全・スムーズ
          </div>
        </div>
      </div>
    </div>
  );
}

// イベント招待ページ用OG画像 - 大幅改善版
function EventOG({ eventTitle, eventDate, eventLocation, eventFee, eventCapacity }: EventOGProps) {
  const formattedDate = formatUtcToJstByType(eventDate, "japanese");
  const feeText = eventFee === 0 ? "参加無料" : `¥${eventFee.toLocaleString()}`;
  const capacityText = eventCapacity ? `定員${eventCapacity}名` : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.primaryDark} 50%, ${BRAND_COLORS.secondary} 100%)`,
        fontFamily: '"Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif',
      }}
    >
      <DecorativeBackground />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "50px 70px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ヘッダー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <EventPayIcon size={44} />
            <div
              style={{
                display: "flex",
                fontSize: FONT_CONFIG.size.body,
                fontWeight: FONT_CONFIG.weight.bold,
                color: BRAND_COLORS.white,
              }}
            >
              みんなの集金
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 20px",
              background: BRAND_COLORS.accent,
              borderRadius: "20px",
              fontSize: FONT_CONFIG.size.small,
              fontWeight: FONT_CONFIG.weight.bold,
              color: BRAND_COLORS.dark,
            }}
          >
            イベント招待
          </div>
        </div>

        {/* メインコンテンツ */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: "32px",
            marginTop: "-20px",
          }}
        >
          {/* イベントタイトル */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: FONT_CONFIG.size.small,
                fontWeight: FONT_CONFIG.weight.semibold,
                color: BRAND_COLORS.white,
                opacity: 0.9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Event
            </div>
            <div
              style={{
                display: "flex",
                fontSize: FONT_CONFIG.size.title,
                fontWeight: FONT_CONFIG.weight.bold,
                color: BRAND_COLORS.white,
                lineHeight: 1.3,
                textShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                maxWidth: "900px",
              }}
            >
              {eventTitle}
            </div>
          </div>

          {/* イベント詳細カード */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              padding: "32px",
              background: BRAND_COLORS.overlayLight,
              borderRadius: "20px",
              border: `1px solid ${BRAND_COLORS.overlayLight}`,
              backdropFilter: "blur(10px)",
              maxWidth: "800px",
            }}
          >
            {/* 日時 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: BRAND_COLORS.overlayLight,
                  borderRadius: "10px",
                  fontSize: "24px",
                }}
              >
                📅
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: FONT_CONFIG.size.body,
                  fontWeight: FONT_CONFIG.weight.semibold,
                  color: BRAND_COLORS.white,
                }}
              >
                {formattedDate}
              </div>
            </div>

            {/* 場所 */}
            {eventLocation && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: BRAND_COLORS.overlayLight,
                    borderRadius: "10px",
                    fontSize: "24px",
                  }}
                >
                  📍
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: FONT_CONFIG.size.body,
                    fontWeight: FONT_CONFIG.weight.semibold,
                    color: BRAND_COLORS.white,
                  }}
                >
                  {eventLocation}
                </div>
              </div>
            )}

            {/* 参加費と定員 */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                marginTop: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 20px",
                  background:
                    eventFee === 0 ? `${BRAND_COLORS.accent}20` : BRAND_COLORS.overlayLight,
                  borderRadius: "12px",
                  border: eventFee === 0 ? `2px solid ${BRAND_COLORS.accent}` : "none",
                }}
              >
                <span style={{ fontSize: "24px" }}>💰</span>
                <span
                  style={{
                    fontSize: FONT_CONFIG.size.body,
                    fontWeight: FONT_CONFIG.weight.bold,
                    color: eventFee === 0 ? BRAND_COLORS.accent : BRAND_COLORS.white,
                  }}
                >
                  {feeText}
                </span>
              </div>

              {capacityText && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 20px",
                    background: BRAND_COLORS.overlayLight,
                    borderRadius: "12px",
                  }}
                >
                  <span style={{ fontSize: "24px" }}>👥</span>
                  <span
                    style={{
                      fontSize: FONT_CONFIG.size.body,
                      fontWeight: FONT_CONFIG.weight.semibold,
                      color: BRAND_COLORS.white,
                    }}
                  >
                    {capacityText}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フッター */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.9,
            }}
          >
            ✅ 出欠登録
          </div>
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.6,
            }}
          >
            •
          </div>
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.9,
            }}
          >
            💳 オンライン決済
          </div>
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.6,
            }}
          >
            •
          </div>
          <div
            style={{
              display: "flex",
              fontSize: FONT_CONFIG.size.small,
              color: BRAND_COLORS.white,
              opacity: 0.9,
            }}
          >
            📊 自動集計
          </div>
        </div>
      </div>
    </div>
  );
}

// キャッシュヘッダーの定数
const CACHE_HEADERS = {
  homepage: {
    "Cache-Control":
      "public, max-age=86400, s-maxage=86400, stale-while-revalidate=2592000, immutable",
  },
  event: {
    "Cache-Control": "public, max-age=7200, s-maxage=7200, stale-while-revalidate=86400",
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    logger.info("OG画像生成リクエスト", {
      tag: "ogImageGeneration",
      type,
      url: request.url,
    });

    // トップページ用
    if (type === "homepage") {
      logger.info("トップページ用OG画像を生成", {
        tag: "ogImageGeneration",
        type: "homepage",
      });

      return new ImageResponse(<HomepageOG />, {
        ...OG_IMAGE_SIZE,
        headers: CACHE_HEADERS.homepage,
      });
    }

    // イベント招待ページ用
    if (type === "event") {
      const eventTitle = searchParams.get("eventTitle");
      const eventDate = searchParams.get("eventDate");
      const eventLocation = searchParams.get("eventLocation");
      const eventFee = searchParams.get("eventFee");
      const eventCapacity = searchParams.get("eventCapacity");

      // 必須パラメータの検証
      if (!eventTitle || !eventDate || eventFee === null) {
        logger.warn("OG画像生成: 必須パラメータが不足", {
          tag: "ogImageGeneration",
          missingParams: {
            eventTitle: !eventTitle,
            eventDate: !eventDate,
            eventFee: eventFee === null,
          },
        });
        return new Response("必須パラメータが不足しています", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      const fee = parseInt(eventFee, 10);
      const capacity = eventCapacity ? parseInt(eventCapacity, 10) : null;

      if (isNaN(fee) || fee < 0) {
        logger.warn("OG画像生成: 無効な参加費パラメータ", {
          tag: "ogImageGeneration",
          eventFee,
        });
        return new Response("無効な参加費パラメータです", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      if (capacity !== null && (isNaN(capacity) || capacity < 1)) {
        logger.warn("OG画像生成: 無効な定員パラメータ", {
          tag: "ogImageGeneration",
          eventCapacity,
        });
        return new Response("無効な定員パラメータです", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      logger.info("イベントOG画像生成完了", {
        tag: "ogImageGeneration",
        eventTitle,
        fee,
        capacity,
        hasLocation: !!eventLocation,
      });

      return new ImageResponse(
        (
          <EventOG
            eventTitle={eventTitle}
            eventDate={eventDate}
            eventLocation={eventLocation}
            eventFee={fee}
            eventCapacity={capacity}
          />
        ),
        {
          ...OG_IMAGE_SIZE,
          headers: CACHE_HEADERS.event,
        }
      );
    }

    logger.warn("OG画像生成: 無効なタイプパラメータ", {
      tag: "ogImageGeneration",
      type,
    });
    return new Response("無効なタイプパラメータです", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    logger.error("OG画像生成エラー", {
      tag: "ogImageGeneration",
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url: request.url,
    });
    return new Response("内部サーバーエラーが発生しました", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
