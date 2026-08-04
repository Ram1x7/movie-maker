# Heartopia 切り抜き・動画編集ツール

Heartopiaの切り抜き/動画編集向けに作った4つの単一HTMLツールです。ビルド不要、サーバー不要。GitHub Pagesなどの静的ホスティングにそのまま置くだけで動きます。

- **[buzz-structure-ai.html](./buzz-structure-ai.html)** — バズる構成案の提案(企画モード)+ 既存のYouTube/TikTok動画のリサーチモード(oEmbed取得・Whisper文字起こし・バズ要因分析)
- **[clip-finder-ai.html](./clip-finder-ai.html)** — 切り抜き箇所の提案(字幕解析・動画フレーム解析・Whisper自動文字起こし)
- **[post-assist-ai.html](./post-assist-ai.html)** — テロップ/効果音/BGMの選定提案
- **[edit-timeline-ai.html](./edit-timeline-ai.html)** — 「バズる構成AI」(企画モード)と「切り抜きファインダーAI」の結果を統合し、CapCut等での手作業編集にそのまま使える編集タイムラインを生成

4ツールとも同じデザインで、上部のナビゲーションから相互に移動できます。

## 使い方

### 1. デプロイする

このリポジトリをそのままGitHub Pagesで公開するか、任意の静的ホスティング(Netlify, Cloudflare Pagesなど)にアップロードしてください。ビルドステップは不要です。ローカルで確認する場合は、リポジトリ直下で簡易サーバーを立てて開いてください(`file://`で直接開くとブラウザによってはモジュール読み込みが失敗します)。

```bash
python3 -m http.server 8000
# → http://localhost:8000/buzz-structure-ai.html など
```

### 2. Anthropic APIキーを設定する

各ツールはブラウザから直接 `api.anthropic.com` を呼び出します。バックエンドサーバーはありません。初回利用時、画面右上の🔑アイコンから[Anthropic Console](https://console.anthropic.com/settings/keys)で発行したAPIキー(`sk-ant-...`)を入力してください。

- キーはこの端末のブラウザの`localStorage`にのみ保存され、`api.anthropic.com`以外には送信されません。
- 同一オリジンで動く他のスクリプト(悪意ある拡張機能など)からは読み取られる可能性があるため、共有・公共のPCでは使用後に🔑アイコンから「削除」してください。
- このツール専用に利用上限額を絞ったAPIキーを発行することを推奨します。
- キー未設定のまま生成を実行すると、エラーメッセージとともに設定モーダルが自動的に開きます。

### 3. 各ツールを使う

すべて日本語UIです。フォームに入力して生成ボタンを押すだけで、Claude(`claude-sonnet-5`)がJSON形式で結果を返し、画面に整形して表示します。

## 文字起こし(Whisper)について

`buzz-structure-ai.html`(リサーチモード)と`clip-finder-ai.html`は、[@xenova/transformers](https://github.com/xenova/transformers.js)を使ってブラウザ内でWhisperによる文字起こしができます。

- 処理はすべて端末内で完結し、動画ファイルはどこにも送信されません。
- 初回はモデル(tiny/base/small)のダウンロードに数十秒〜数分かかりますが、以降はブラウザにキャッシュされます。
- ファイルサイズが500MB超、または動画の長さが20分超の場合、処理が重くなる可能性がある旨の警告が表示されます。

## 動画情報の自動取得(oEmbed)について

`buzz-structure-ai.html`のリサーチモードでは、TikTok/YouTubeのoEmbedエンドポイントからタイトル・投稿者・サムネイルを自動取得します。TikTok側のCORS制限などで自動取得に失敗した場合は、「手動で入力する」からタイトル・投稿者を直接入力して進められます。

## 編集タイムライン統合(edit-timeline-ai.html)について

「バズる構成AI」の構成案(フック・展開などの役割)と「切り抜きファインダーAI」のスコア付き候補(実際の元動画のタイムコード)を組み合わせて、CapCut Pro等で手作業編集する際にそのまま見ながら作業できるタイムラインを作成します。

使い方:
1. `buzz-structure-ai.html`の企画モードで構成案を生成し、結果画面の「この結果をコピー」ボタンでJSONをコピー
2. `clip-finder-ai.html`で切り抜き候補を生成し、同様に「この結果をコピー」でJSONをコピー
3. `edit-timeline-ai.html`の該当欄にそれぞれ貼り付けて生成

※ CapCutの独自プロジェクトファイル(`.draft_content.json`)を直接生成してインポートする方式は、非公開・未文書化のフォーマットで壊れるリスクが高いため採用していません。あくまで人間が画面を見ながら手作業編集するための一覧表です。

## リポジトリ構成

```
buzz-structure-ai.html   バズる構成AI(企画モード / リサーチモード)
clip-finder-ai.html      切り抜きファインダーAI
post-assist-ai.html      テロップ/SE/BGM選定AI
edit-timeline-ai.html    編集タイムライン統合AI
shared/
  api-client.js          Anthropic APIキーの管理・設定モーダル・fetchラッパー
  whisper.js             ブラウザ内Whisper文字起こしの共通処理
  nav.js                 4ツール共通のナビゲーションバー
  theme.css               共通デザイントークン・ベーススタイル
```

## セキュリティに関する注意

- APIキーはブラウザの`localStorage`に保存されます。パスワードと同様に扱ってください。
- リポジトリやビルド成果物にAPIキーを含めないでください(このツールはその場で入力する方式のため、通常は問題になりません)。
- 本番でより高いセキュリティが必要な場合(APIキーをサーバー側で秘匿したい場合)は、Cloudflare Workers等の軽量プロキシを別途用意する構成に変更することも可能です。
