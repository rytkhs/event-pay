#!/bin/bash

# プルリクエスト用差分生成スクリプト
# 使用方法: ./generate_diff.sh
# 標準入力でベースブランチとターゲットブランチを指定

set -e

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
OUTPUT_DIR="storage/git-diffs"
mkdir -p "$OUTPUT_DIR"

# タイムスタンプの生成
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

print_info "Git差分生成スクリプトを開始します"
echo

# ベースブランチの入力
print_info "ベースブランチを入力してください（例: main, develop）:"
read -p "> " BASE_BRANCH

if [ -z "$BASE_BRANCH" ]; then
    print_error "ベースブランチが指定されていません"
    exit 1
fi

# ターゲットブランチの入力
print_info "ターゲットブランチを入力してください（例: feature/new-feature, develop）:"
read -p "> " TARGET_BRANCH

if [ -z "$TARGET_BRANCH" ]; then
    print_error "ターゲットブランチが指定されていません"
    exit 1
fi

# ブランチの存在確認
if ! git rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1; then
    print_error "ベースブランチ '$BASE_BRANCH' が存在しません"
    exit 1
fi

if ! git rev-parse --verify "$TARGET_BRANCH" >/dev/null 2>&1; then
    print_error "ターゲットブランチ '$TARGET_BRANCH' が存在しません"
    exit 1
fi

# ファイル名の生成（スラッシュをアンダースコアに置換）
SAFE_BASE_BRANCH=$(echo "$BASE_BRANCH" | sed 's/\//_/g')
SAFE_TARGET_BRANCH=$(echo "$TARGET_BRANCH" | sed 's/\//_/g')
DIFF_FILE="${OUTPUT_DIR}/diff_${SAFE_BASE_BRANCH}_to_${SAFE_TARGET_BRANCH}_${TIMESTAMP}.txt"
LOG_FILE="${OUTPUT_DIR}/log_${SAFE_BASE_BRANCH}_to_${SAFE_TARGET_BRANCH}_${TIMESTAMP}.txt"

print_info "差分を生成中..."
echo "ベースブランチ: $BASE_BRANCH"
echo "ターゲットブランチ: $TARGET_BRANCH"
echo

# ファイル差分の生成
print_info "ファイル差分を生成しています..."
{
    echo "================================="
    echo "Git差分レポート (ファイル変更)"
    echo "================================="
    echo
    echo "生成日時: $(date)"
    echo "ベースブランチ: $BASE_BRANCH"
    echo "ターゲットブランチ: $TARGET_BRANCH"
    echo
    echo "================================="
    echo "変更されたファイルの統計"
    echo "================================="
    git diff --stat "$BASE_BRANCH".."$TARGET_BRANCH"
    echo
    echo "================================="
    echo "詳細な差分"
    echo "================================="
    git diff "$BASE_BRANCH".."$TARGET_BRANCH"
} > "$DIFF_FILE"

# コミットログ差分の生成
print_info "コミットログ差分を生成しています..."
{
    echo "================================="
    echo "Git差分レポート (コミットログ)"
    echo "================================="
    echo
    echo "生成日時: $(date)"
    echo "ベースブランチ: $BASE_BRANCH"
    echo "ターゲットブランチ: $TARGET_BRANCH"
    echo
    echo "================================="
    echo "コミット履歴 (簡潔版)"
    echo "================================="
    git log --oneline "$BASE_BRANCH".."$TARGET_BRANCH"
    echo
    echo "================================="
    echo "コミット履歴 (詳細版)"
    echo "================================="
    git log --pretty=format:"%h - %an, %ar : %s" "$BASE_BRANCH".."$TARGET_BRANCH"
    echo
    echo
    echo "================================="
    echo "詳細なコミット情報"
    echo "================================="
    git log --stat "$BASE_BRANCH".."$TARGET_BRANCH"
} > "$LOG_FILE"

# 結果の表示
echo
print_success "差分ファイルが正常に生成されました："
echo "  ファイル差分: $DIFF_FILE"
echo "  ログ差分: $LOG_FILE"
echo

# ファイルサイズの表示
DIFF_SIZE=$(du -h "$DIFF_FILE" | cut -f1)
LOG_SIZE=$(du -h "$LOG_FILE" | cut -f1)

print_info "生成されたファイルの情報："
echo "  ファイル差分サイズ: $DIFF_SIZE"
echo "  ログ差分サイズ: $LOG_SIZE"

# 変更されたファイル数の表示
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH".."$TARGET_BRANCH" | wc -l)
COMMIT_COUNT=$(git log --oneline "$BASE_BRANCH".."$TARGET_BRANCH" | wc -l)

echo "  変更されたファイル数: $CHANGED_FILES"
echo "  コミット数: $COMMIT_COUNT"

echo
print_info "プルリクエスト作成時にこれらのファイルをご活用ください。"
