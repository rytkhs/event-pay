import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// 180x180 Apple touch icon generated from the SVG paths for brand consistency
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M 16 0 Q 24 8, 16 16 Q 8 8, 16 0" fill="#24a6b5" />
          <path d="M 32 16 Q 24 24, 16 16 Q 24 8, 32 16" fill="#24a6b5" fillOpacity="0.8" />
          <path d="M 16 32 Q 8 24, 16 16 Q 24 24, 16 32" fill="#24a6b5" fillOpacity="0.6" />
          <path d="M 0 16 Q 8 8, 16 16 Q 8 24, 0 16" fill="#24a6b5" fillOpacity="0.4" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
