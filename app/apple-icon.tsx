import { ImageResponse } from "next/og";

// Route segment config
export const runtime = "edge";

// 180x180 Apple touch icon generated from the SVG paths for brand consistency
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <svg width="180" height="180" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="transparent" />
        <path d="M 100 60 Q 120 80, 100 100 Q 80 80, 100 60" fill="#24a6b5" />
        <path d="M 140 100 Q 120 120, 100 100 Q 120 80, 140 100" fill="#24a6b5" fillOpacity="0.8" />
        <path d="M 100 140 Q 80 120, 100 100 Q 120 120, 100 140" fill="#24a6b5" fillOpacity="0.6" />
        <path d="M 60 100 Q 80 80, 100 100 Q 80 120, 60 100" fill="#24a6b5" fillOpacity="0.4" />
      </svg>
    ),
    {
      ...size,
    }
  );
}
