# 防災学習Webマップ

このフォルダ内のGeoJSONを使った、Leafletによるローカル確認用の防災学習Webマップです。

## 使用データ

```text
data/municipality.geojson
data/tsunami_inundation_light_v2.geojson
data/tsunami_inundation_light.geojson (旧軽量版。削除せず保持)
data/evacuation_sites_tsunami.geojson
```

## 機能

- 国土地理院の淡色地図タイルを背景地図として表示
- 市町村レイヤーを初期表示
- 津波対応の指定緊急避難場所を初期表示
- 避難場所は Leaflet.markercluster でクラスタ表示し、縮小時や地区拡大時にアイコンが密集しすぎないように表示
- 避難場所の個別表示は小さい円形マーカーにして、地図上で控えめに表示
- 津波浸水域レイヤーは初期OFF
- 津波浸水域レイヤーをONにしたときだけ `data/tsunami_inundation_light_v2.geojson` を読み込み
- 津波浸水域を `A40_003` の値で青系に色分けして表示
- レイヤー切替、凡例、出典表示、注意書きを表示
- 市町村と避難場所のクリック時にポップアップを表示
- GeoJSON読み込み中の表示と、エラー時の画面表示
- 初期表示範囲は北海道全体ではなく、釧路・根室・十勝東部が見やすい範囲に設定

## ローカル確認方法

このフォルダで以下を実行します。`--bind 127.0.0.1` を指定しているため、このPC内だけで確認するローカルサーバーとして起動します。

```bash
py -m http.server 5500 --bind 127.0.0.1
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:5500
```

これはこのPC内での確認用URLであり、現段階ではインターネット公開しない方針です。

## サーバー停止方法

PowerShellで待受PIDを確認します。

```powershell
netstat -ano | Select-String ':5500'
```

表示されたPIDを指定して停止します。

```powershell
Stop-Process -Id <PID>
```

## 注意

このWebマップは防災学習を目的とした参考資料です。災害時は、気象庁・自治体・国土地理院などの公式情報を必ず確認してください。避難場所・避難所の最新情報は自治体の公式情報を確認してください。

このサイトはURLを知っている関係者向けの共有を想定しています。ただし、完全な非公開・アクセス制限ではありません。`noindex` や `robots.txt` は検索に出にくくするための指定であり、URLを知っている人のアクセスを止めるものではありません。

## 将来の公開方針

- GitHub Pagesで公開する場合は、GitHub Actionsではなく `Deploy from a branch` を使う想定です。
- npm、ビルドツール、APIキー、Google Maps APIは使いません。
- 公開前に、子どもの名前、顔写真、施設内部情報、職場PCのローカルパス、APIキーが含まれていないか確認します。
- 公開前に `index.html / style.css / script.js / README.md / data/*.geojson` のみを公開対象にします。
- `noindex` は検索に出にくくするための指定であり、URLを知っている人のアクセスを止めるものではありません。

## 補足

- Google Maps APIやAPIキーは使用していません。
- npmやビルドツールは使用していません。
- GitHub Pagesへの公開、外部サービスへのアップロード、git push は行っていません。
- Leaflet本体、Leaflet.markercluster、背景地図タイルをインターネット経由で読み込むため、表示確認時にはネットワーク接続が必要です。
