import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertSvgToPng() {
  try {
    const svgPath = path.join(__dirname, "../app/icon.svg");
    const outputDir = path.join(__dirname, "../public");

    // 出力ディレクトリが存在しない場合は作成
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 複数のサイズでPNGを生成
    const sizes = [
      { size: 16, name: "icon-16.png" },
      { size: 32, name: "icon-32.png" },
      { size: 48, name: "icon-48.png" },
      { size: 64, name: "icon-64.png" },
      { size: 96, name: "icon-96.png" },
      { size: 128, name: "icon-128.png" },
      { size: 192, name: "icon-192.png" },
      { size: 256, name: "icon-256.png" },
      { size: 512, name: "icon-512.png" },
    ];

    console.log("SVGからPNGへの変換を開始します...");

    for (const { size, name } of sizes) {
      const outputPath = path.join(outputDir, name);

      await sharp(svgPath).resize(size, size).png().toFile(outputPath);

      console.log(`✓ ${name} (${size}x${size}) を生成しました`);
    }

    console.log("すべてのPNGファイルの生成が完了しました！");
  } catch (error) {
    console.error("変換中にエラーが発生しました:", error);
    process.exit(1);
  }
}

convertSvgToPng();
