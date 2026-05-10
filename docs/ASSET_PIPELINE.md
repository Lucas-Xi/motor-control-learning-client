# GPT Image 2 素材生成管线

本项目已经接入 `gpt-image-2` 素材体系。正式位图素材会放在 `public/assets/generated/`，缺失时 `AssetHero` 会自动使用代码生成的 fallback 视觉，保证应用可运行、可构建、可演示。

## 素材清单

权威清单在：

```text
src/content/visualAssets.ts
```

批量提示词 JSONL 在：

```text
tmp/imagegen/motor-control-prompts.jsonl
```

正式生成图应保存到：

```text
public/assets/generated/
```

## 推荐生成命令

已提供封装脚本：

```text
scripts/generate-image-assets.ps1
```

它会读取本地环境变量 `OPENAI_API_KEY`，把 `OPENAI_BASE_URL` 临时设为供应商地址，并在生成成功后复制到 `public/assets/generated/`。脚本不会保存密钥。

当前项目脚本使用 `scripts/generate-image-assets-raw.mjs` 直接调用 OpenAI-compatible `/v1/images/generations` 接口，避免本机旧版 OpenAI Python SDK 对 `gpt-image-2` 参数支持不足的问题。

PowerShell：

```powershell
$env:OPENAI_API_KEY="你的密钥"
.\scripts\generate-image-assets.ps1 -BaseUrl "https://codex.ciii.club/v1" -Concurrency 1
```

如果供应商后台要求不带 `/v1` 的完整地址，可改为：

```powershell
.\scripts\generate-image-assets.ps1 -BaseUrl "https://codex.ciii.club" -Concurrency 1
```

建议先用 `-Concurrency 1`，避免供应商侧图片生成并发限制触发 429。

先做 dry-run：

```powershell
$env:OPENAI_API_KEY="你的密钥"
.\scripts\generate-image-assets.ps1 -DryRun
```

## 直接调用 Node 生成器

PowerShell：

```powershell
$env:OPENAI_API_KEY="你的密钥"
$env:OPENAI_BASE_URL="https://codex.ciii.club/v1"
node .\scripts\generate-image-assets-raw.mjs `
  --input tmp\imagegen\motor-control-prompts.jsonl `
  --out-dir output\imagegen `
  --public-dir public\assets\generated
```

生成器会同时写入 `output/imagegen/` 和 `public/assets/generated/`。

## WebP 优化

正式 PNG 图通常较大，建议生成后运行：

```powershell
python .\scripts\optimize-image-assets.py
```

该脚本会读取 `public/assets/generated/*.png`，输出同名 `.webp` 文件。应用中的 `AssetHero` 会优先通过 `<picture>` 加载 WebP，并把 PNG 作为兼容回退。

文件名需要和 `src/content/visualAssets.ts` 中的 `filename` 对应，例如：

```text
public/assets/generated/foc-flow-console.png
public/assets/generated/svpwm-sector-map.png
```

## 质量要求

- 不要出现英文 UI 文本、品牌、Logo、水印。
- 必须是工程仿真教学风，不要卡通化、不要普通后台插画。
- 图像只是增强素材，核心教学逻辑仍由 React / SVG / Three.js / TypeScript 仿真驱动。
- 如果模型生成了错误文字，优先裁掉或重生成，不要把错误文字用于教学。

## 当前降级策略

`AssetHero` 组件会优先尝试加载 `public/assets/generated/*.png`。如果文件不存在或加载失败，就显示代码生成的仪表盘式 fallback 视觉，因此项目不会因为缺少位图素材而白屏。
