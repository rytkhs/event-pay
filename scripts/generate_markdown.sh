#!/bin/bash

# ファイル名を引数として受け取り、指定された形式でマークダウンファイルを生成するスクリプト
# 使用方法: ./generate_markdown.sh "file1.txt" "file2.js" "file3.py"

# 引数が空の場合は使用方法を表示
if [ $# -eq 0 ]; then
    echo "使用方法: $0 \"file1.txt\" \"file2.js\" \"file3.py\""
    echo "例: $0 \"src/components/Button.tsx\" \"src/utils/helper.js\""
    exit 1
fi

# 出力ファイル名（ルートディレクトリに生成）
OUTPUT_FILE="generated_files.md"

# 出力ファイルを初期化（既存の内容をクリア）
> "$OUTPUT_FILE"

echo "マークダウンファイルを生成中..."

# 各ファイルを処理
for file_path in "$@"; do
    # フルパスを相対パスに変換
    relative_path=$(realpath --relative-to="$(pwd)" "$file_path" 2>/dev/null || echo "$file_path")

    # ファイルが存在するかチェック
    if [ -f "$file_path" ]; then
        echo "#### $relative_path" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        cat "$file_path" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "✓ $relative_path を処理しました"
    else
        echo "⚠ 警告: $relative_path が見つかりません"
        echo "#### $relative_path" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        echo "# ファイルが見つかりません: $relative_path" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
done

echo ""
echo "✓ マークダウンファイルが生成されました: $OUTPUT_FILE"
# echo "生成されたファイルの内容:"
# echo "----------------------------------------"
# cat "$OUTPUT_FILE"
