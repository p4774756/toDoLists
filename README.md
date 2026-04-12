# 待辦清單（Vue 3 + Vite）

瀏覽器端待辦，資料存於 `localStorage`。

## 本機開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

靜態輸出在 `dist/`。`vite.config.js` 已設 `base: '/toDoLists/'`，對應 GitHub Pages 網址路徑。

## GitHub Pages

1. 將程式推送到 `main`（或 `master`）分支。
2. 在倉庫 **Settings → Pages**：**Build and deployment** 的 **Source** 選 **GitHub Actions**。
3. 推送會觸發 `.github/workflows/deploy-pages.yml`，完成後網址約為：`https://<你的使用者名>.github.io/toDoLists/`

若 `deploy-pages` 出現 **Creating Pages deployment failed / HttpError: Not Found**，請到 **Settings → Pages**，將 **Source** 設為 **GitHub Actions** 後再重跑 workflow（或等新的 push）。未啟用此選項時，部署 API 會回 404。

首次上線後若網站 404，同樣先確認上述設定，並查看 Actions 是否成功。
