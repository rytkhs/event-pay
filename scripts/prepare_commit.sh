#!/bin/bash

# コミット準備支援スクリプト
# 現在の変更ファイルの差分を確認し、コミット戦略とメッセージを検討するための一時ファイルを作成

set -e

# オプション解析
SHOW_UNTRACKED_CONTENT=true
UNTRACKED_MAX_SIZE_KB=50
UNTRACKED_MAX_FILES=20

# ヘルプ表示
show_help() {
    cat << EOF
コミット準備支援スクリプト

使用方法:
  $0 [オプション]

オプション:
  -h, --help                    このヘルプを表示
  --no-untracked-content        未追跡ファイルの内容を表示しない
  --untracked-max-size SIZE     未追跡ファイルの最大サイズ (KB, デフォルト: 50)
  --untracked-max-files NUM     未追跡ファイルの最大表示数 (デフォルト: 20)

例:
  $0                           # 標準実行
  $0 --no-untracked-content    # 未追跡ファイルの内容を表示しない
  $0 --untracked-max-size 100  # 100KB以下のファイルのみ内容表示

EOF
}

# オプション解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        --no-untracked-content)
            SHOW_UNTRACKED_CONTENT=false
            shift
            ;;
        --untracked-max-size)
            UNTRACKED_MAX_SIZE_KB="$2"
            shift 2
            ;;
        --untracked-max-files)
            UNTRACKED_MAX_FILES="$2"
            shift 2
            ;;
        *)
            print_error "不明なオプション: $1"
            show_help
            exit 1
            ;;
    esac
done

# 色付きの出力関数
print_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

print_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

# 出力ディレクトリの設定
OUTPUT_DIR="storage/commit-preparation"
mkdir -p "$OUTPUT_DIR"

# タイムスタンプの生成
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

print_info "コミット準備支援スクリプトを開始します"
echo

# Git作業ディレクトリの確認
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Gitリポジトリではありません"
    exit 1
fi

# 変更があるかチェック
if git diff --quiet && git diff --cached --quiet; then
    print_warning "変更されたファイルがありません"
    exit 0
fi

# ファイル名の生成
COMMIT_PREP_FILE="${OUTPUT_DIR}/commit_preparation_${TIMESTAMP}.md"

print_info "変更ファイルの分析中..."

# 変更ファイルの情報を取得
MODIFIED_FILES=$(git diff --name-only)
STAGED_FILES=$(git diff --cached --name-only)
UNTRACKED_FILES=$(git ls-files --others --exclude-standard)

# ファイルタイプ別の分類
TEST_FILES=$(echo "$MODIFIED_FILES" | grep -E "(test|spec)" || true)
LANG_FILES=$(echo "$MODIFIED_FILES" | grep "lang/" || true)
VIEW_FILES=$(echo "$MODIFIED_FILES" | grep -E "\.(blade\.php|vue|js|css)$" || true)
BACKEND_FILES=$(echo "$MODIFIED_FILES" | grep -E "\.(php)$" | grep -v -E "(test|spec|blade\.php)" || true)
CONFIG_FILES=$(echo "$MODIFIED_FILES" | grep -E "(config/|\.json$|\.yaml$|\.yml$)" || true)

# コミット準備ファイルを生成
{
    echo "# コミット準備レポート"
    echo
    echo "**生成日時:** $(date)"
    echo "**現在のブランチ:** $(git branch --show-current)"
    echo
    echo "---"
    echo
    echo "## 🔍 変更ファイルの概要"
    echo

    # ステージングエリアの状況
    if [ -n "$STAGED_FILES" ]; then
        echo "### ✅ ステージ済みファイル ($( echo "$STAGED_FILES" | wc -l )件)"
        echo '```'
        echo "$STAGED_FILES"
        echo '```'
        echo
    fi

    # 未ステージファイル
    if [ -n "$MODIFIED_FILES" ]; then
        echo "### 📝 変更済み（未ステージ）ファイル ($( echo "$MODIFIED_FILES" | wc -l )件)"
        echo '```'
        echo "$MODIFIED_FILES"
        echo '```'
        echo
    fi

    # 未追跡ファイル
    if [ -n "$UNTRACKED_FILES" ]; then
        echo "### ❓ 未追跡ファイル ($( echo "$UNTRACKED_FILES" | wc -l )件)"
        echo '```'
        echo "$UNTRACKED_FILES"
        echo '```'
        echo
    fi

    echo "---"
    echo
    echo "## 📊 ファイルタイプ別分類"
    echo

    [ -n "$BACKEND_FILES" ] && {
        echo "### 🔧 バックエンドファイル"
        echo '```'
        echo "$BACKEND_FILES"
        echo '```'
        echo
    }

    [ -n "$VIEW_FILES" ] && {
        echo "### 🎨 フロントエンド/ビューファイル"
        echo '```'
        echo "$VIEW_FILES"
        echo '```'
        echo
    }

    [ -n "$TEST_FILES" ] && {
        echo "### 🧪 テストファイル"
        echo '```'
        echo "$TEST_FILES"
        echo '```'
        echo
    }

    [ -n "$LANG_FILES" ] && {
        echo "### 🌐 言語ファイル"
        echo '```'
        echo "$LANG_FILES"
        echo '```'
        echo
    }

    [ -n "$CONFIG_FILES" ] && {
        echo "### ⚙️ 設定ファイル"
        echo '```'
        echo "$CONFIG_FILES"
        echo '```'
        echo
    }

    echo "---"
    echo
    echo "## 📈 変更統計"
    echo
    echo '```'
    git diff --stat
    echo '```'
    echo

    echo "---"
    echo
    echo "## 💡 推奨コミット戦略"
    echo

    # コミット戦略の提案
    if [ -n "$TEST_FILES" ] && [ -n "$BACKEND_FILES" ]; then
        echo "### 🎯 機能実装 + テスト"
        echo "- **機能コミット:** バックエンドの変更を先にコミット"
        echo "- **テストコミット:** 関連するテストを別コミットで追加"
        echo
    fi

    if [ -n "$LANG_FILES" ]; then
        echo "### 🌍 多言語対応"
        echo "- **翻訳コミット:** 言語ファイルは独立してコミット推奨"
        echo
    fi

    if [ -n "$VIEW_FILES" ] && [ -n "$BACKEND_FILES" ]; then
        echo "### 🔄 フルスタック変更"
        echo "- **バックエンドコミット:** APIやロジックの変更"
        echo "- **フロントエンドコミット:** UI/UXの変更"
        echo
    fi

    echo "---"
    echo
    echo "## 📝 コミットメッセージ候補"
    echo

    # コミットメッセージの候補を生成
    if [ -n "$TEST_FILES" ] && [ -n "$BACKEND_FILES" ]; then
        echo "### 🧪 テスト関連"
        echo '```'
        echo "test: テストケースの追加・修正"
        echo "fix: テスト不具合の修正"
        echo "refactor: テストコードのリファクタリング"
        echo '```'
        echo
    fi

    if [ -n "$LANG_FILES" ]; then
        echo "### 🌐 国際化"
        echo '```'
        echo "i18n: 翻訳ファイルの更新"
        echo "i18n: 新規言語キーの追加"
        echo "i18n: 翻訳内容の修正"
        echo '```'
        echo
    fi

    if [ -n "$VIEW_FILES" ]; then
        echo "### 🎨 UI/UX"
        echo '```'
        echo "feat: 新機能のUI実装"
        echo "fix: UIの不具合修正"
        echo "style: デザインの調整"
        echo "refactor: コンポーネントのリファクタリング"
        echo '```'
        echo
    fi

    if [ -n "$BACKEND_FILES" ]; then
        echo "### 🔧 バックエンド"
        echo '```'
        echo "feat: 新機能の実装"
        echo "fix: バグ修正"
        echo "refactor: コードのリファクタリング"
        echo "perf: パフォーマンス改善"
        echo '```'
        echo
    fi

    echo "### 📋 一般的なプレフィックス"
    echo '```'
    echo "feat:     新機能の追加"
    echo "fix:      バグ修正"
    echo "docs:     ドキュメント関連"
    echo "style:    フォーマット、セミコロン追加など"
    echo "refactor: リファクタリング"
    echo "test:     テスト関連"
    echo "chore:    ビルド関連、依存関係など"
    echo '```'
    echo

    echo "---"
    echo
    echo "## 🔍 詳細な差分"
    echo

    # ステージ済みの差分
    if [ -n "$STAGED_FILES" ]; then
        echo "### ✅ ステージ済み変更の差分"
        if echo "$STAGED_FILES" | grep -q "package-lock.json"; then
            echo "> ⚠️ package-lock.json の差分は省略されています"
            echo
        fi
        echo '```diff'
        git diff --cached -- ":!package-lock.json"
        echo '```'
        echo
    fi

    # 未ステージの差分
    if [ -n "$MODIFIED_FILES" ]; then
        echo "### 📝 未ステージ変更の差分"
        if echo "$MODIFIED_FILES" | grep -q "package-lock.json"; then
            echo "> ⚠️ package-lock.json の差分は省略されています"
            echo
        fi
        echo '```diff'
        git diff -- ":!package-lock.json"
        echo '```'
        echo
    fi

            # 未追跡ファイルの差分
    if [ -n "$UNTRACKED_FILES" ] && [ "$SHOW_UNTRACKED_CONTENT" = true ]; then
        echo "### ❓ 未追跡ファイルの差分（新規ファイル）"

        # 制限値の設定（コマンドライン引数から）
        MAX_FILE_SIZE_KB=$UNTRACKED_MAX_SIZE_KB
        MAX_FILES_TO_SHOW=$UNTRACKED_MAX_FILES

        files_shown=0
        large_files=""
        binary_files=""

        echo '```diff'

        # 未追跡ファイルを一つずつ処理
        echo "$UNTRACKED_FILES" | while read -r file; do
            if [ -f "$file" ] && [ $files_shown -lt $MAX_FILES_TO_SHOW ]; then
                # ファイルサイズをチェック（KB単位）
                file_size_kb=$(du -k "$file" 2>/dev/null | cut -f1)

                # バイナリファイルかチェック
                if file "$file" | grep -q "binary\|executable\|image\|audio\|video\|archive"; then
                    binary_files="$binary_files\n  - $file"
                    continue
                fi

                if [ "$file_size_kb" -gt $MAX_FILE_SIZE_KB ]; then
                    large_files="$large_files\n  - $file (${file_size_kb}KB)"
                    continue
                fi

                echo "diff --git a/dev/null b/$file"
                echo "new file mode 100644"
                echo "index 0000000..$(git hash-object "$file" 2>/dev/null || echo "unknown")"
                echo "--- /dev/null"
                echo "+++ b/$file"

                # ファイルの内容を追加行として表示
                if [ -s "$file" ]; then
                    # テキストファイルかどうか確認してから内容を表示
                    if file "$file" | grep -q "text\|empty\|ASCII"; then
                        sed 's/^/+/' "$file" 2>/dev/null || echo "+<ファイル読み込みエラー>"
                    else
                        echo "+<バイナリファイルのため内容省略>"
                    fi
                else
                    echo "+<空のファイル>"
                fi
                echo

                files_shown=$((files_shown + 1))
            fi
        done

        echo '```'

        # 制限により表示されなかったファイルの情報
        total_untracked=$(echo "$UNTRACKED_FILES" | wc -l)
        if [ $files_shown -lt $total_untracked ]; then
            echo
            echo "**📊 表示制限により省略されたファイル:**"

            if [ $files_shown -eq $MAX_FILES_TO_SHOW ]; then
                remaining_files=$((total_untracked - files_shown))
                echo "- **表示上限達成:** $remaining_files 件のファイルが省略されました"
            fi

            if [ -n "$large_files" ]; then
                echo "- **大きなファイル（${MAX_FILE_SIZE_KB}KB超）:**"
                echo -e "$large_files"
            fi

            if [ -n "$binary_files" ]; then
                echo "- **バイナリファイル:**"
                echo -e "$binary_files"
            fi
        fi

        echo
    elif [ -n "$UNTRACKED_FILES" ] && [ "$SHOW_UNTRACKED_CONTENT" = false ]; then
        echo "### ❓ 未追跡ファイルの差分（内容表示無効）"
        total_untracked=$(echo "$UNTRACKED_FILES" | wc -l)
        echo
        echo "**📋 $total_untracked 件の未追跡ファイルが存在しますが、内容表示は無効化されています。**"
        echo
        echo "内容を表示したい場合は、オプション無しで実行してください。"
        echo "または \`--untracked-max-size\` と \`--untracked-max-files\` オプションで制限を調整できます。"
        echo
    fi

    echo "---"
    echo
    echo "## 🚀 次のアクション"
    echo
    echo "1. **ファイルの確認:** 上記の差分を確認し、意図した変更かチェック"
    echo "2. **ステージング:** 適切なファイルをステージング"
    echo "   - \`git add <file>\` で個別追加"
    echo "   - \`git add -A\` で全て追加"
    echo "3. **コミット:** 適切なメッセージでコミット"
    echo "   - \`git commit -m \"<type>: <description>\"\`"
    echo "4. **プッシュ:** 必要に応じてリモートにプッシュ"
    echo
    echo "**💡 ヒント:** 関連する変更は一つのコミットにまとめ、異なる目的の変更は別々のコミットに分けることを推奨します。"

} > "$COMMIT_PREP_FILE"

# 結果の表示
echo
print_success "コミット準備ファイルが正常に生成されました："
echo "  📄 ファイル: $COMMIT_PREP_FILE"
echo

# ファイルサイズの表示
FILE_SIZE=$(du -h "$COMMIT_PREP_FILE" | cut -f1)
print_info "生成されたファイルの情報："
echo "  📊 ファイルサイズ: $FILE_SIZE"

# 統計情報の表示
TOTAL_MODIFIED=$(echo "$MODIFIED_FILES" | grep -c . || echo "0")
TOTAL_STAGED=$(echo "$STAGED_FILES" | grep -c . || echo "0")
TOTAL_UNTRACKED=$(echo "$UNTRACKED_FILES" | grep -c . || echo "0")

echo "  📈 変更統計:"
echo "    - 変更済みファイル: $TOTAL_MODIFIED"
echo "    - ステージ済みファイル: $TOTAL_STAGED"
echo "    - 未追跡ファイル: $TOTAL_UNTRACKED"

echo
print_info "生成されたファイルを確認して、適切なコミット戦略を検討してください。"

# オプション: ファイルを自動で開く
if command -v code >/dev/null 2>&1; then
    echo
    read -p "🚀 VS Codeで準備ファイルを開きますか？ (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        code "$COMMIT_PREP_FILE"
        print_success "VS Codeでファイルを開きました"
    fi
fi
