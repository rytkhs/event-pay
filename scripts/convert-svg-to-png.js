import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertSvgToPng() {
  try {
    // 入力ファイルと出力ファイルのパス
    const inputFile = path.join(__dirname, "../public/event-default.svg");
    const outputDir = path.join(__dirname, "../public/og");
    const outputFile = path.join(outputDir, "event-default.png");

    // 出力ディレクトリが存在しない場合は作成
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log("Created directory:", outputDir);
    }

    // SVGファイルを読み込んでPNGに変換
    await sharp(inputFile)
      .png({
        quality: 100,
        compressionLevel: 9,
      })
      .toFile(outputFile);

    console.log("Successfully converted SVG to PNG:");
    console.log("Input:", inputFile);
    console.log("Output:", outputFile);

    // ファイルサイズを確認
    const stats = fs.statSync(outputFile);
    console.log("File size:", (stats.size / 1024).toFixed(2), "KB");
  } catch (error) {
    console.error("Error converting SVG to PNG:", error);
    process.exit(1);
  }
}

convertSvgToPng();
