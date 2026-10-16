# ロボットバトル

部位カードでロボットを3体組み、性格のあるCPUと3試合戦うカードゲームです。CPUは試合を重ねるうちに、こちらの出し方のクセも読んでくるようになります。

- ルールの元：<https://github.com/n416/microtools/tree/main/robot>
- 公開版：<https://claude.ai/artifact/PTa57xLJJuXp1Y9bhunZyQ>

## 遊び方

`robot-battle.html` をブラウザで開きます。同じフォルダの `robot-parts.js`（3Dパーツのデータ）と、Three.js r128（cdnjs から読み込み）を使います。ネットにつながっていないときと、WebGL が使えないときは、3D を出さずに遊べます。

## ファイル

| ファイル | 中身 |
|---|---|
| `robot-battle.html` | ゲーム本体 |
| `robot-parts.js` | ex-online の機体から切り出した頭・上半身・下半身（`tools/extract-parts.js` で作る） |
| `tools/extract-parts.js` | 機体の .glb から、中くらいの細かさのモデル（`xs_body_lod1`）と光る部分を切り出す。三角形ごとに一番影響の強い骨で部位を決め、高さを 1 にそろえる |
| `tools/robosim.js` | 性格を読むと得をするかの対戦シミュレーション |
| `tools/robosim2.js` | CPU がこちらのクセを読んだときのシミュレーション |
| `experiments/evolution/` | 先に試した進化ゲームの試作（レース、タイミング、カード、HEX陣取り）と、そのバランス調べ。どれも面白くならなかった記録 |

## 3Dパーツを作り直す

```bash
node tools/extract-parts.js C:/Users/nakam/ex-online/public/models robot-parts.js geo3=a_raid.glb geo2=a_heavy.glb geo1=a_support.glb tsui3=b_raid.glb tsui2=b_heavy.glb tsui1=b_support.glb ana3=a_sniper.glb ana2=b_sniper.glb ana1=a_aqua.glb
```

`ジオ`→`geo`、`ツイ`→`tsui`、`アナ`→`ana` に、カードの値（1〜3）を付けた名前が、どの機体のパーツを使うかを表します。対応を変えるときは、この引数を変えます。

## シミュレーション

```bash
node tools/robosim.js 0.2 1500
node tools/robosim2.js
```

2026-10-16 時点の結果：

- 性格を最初から知っている側は、ランダムに出す側より勝率が約15ポイント高い（66% と 51%）。3試合続けて推理すると、3試合目には知っている側とほぼ同じになる（65%）
- CPU がこちらを読むようにすると、いつも同じ出し方をする側は 50% → 40% → 36% と下がる。ランダムに出す側は約 50% のまま
