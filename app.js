const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件設置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Google Drive API 設置
function getAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  return auth;
}

// 根路徑路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 生成上傳網址的 API
app.post('/api/get-upload-url', async (req, res) => {
  try {
    const { fileName, mimeType, folderId } = req.body;
    
    if (!fileName || !mimeType || !folderId) {
      return res.status(400).json({ 
        error: '缺少必要參數 (fileName, mimeType, folderId)' 
      });
    }

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // 建立媒體上傳初始請求
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    // 獲取上傳 URL
    const response = await drive.files.create({
      resource: fileMetadata,
      media: {
        mimeType: mimeType,
        body: '' // 空的 body，因為我們只是獲取 URL
      },
      fields: 'id',
      supportsAllDrives: true,
      uploadType: 'resumable' // 使用可繼續上傳方式
    }, {
      // 不要自動上傳內容
      onUploadProgress: () => {},
    });

    // 獲取上傳 URL 從響應頭
    const uploadUrl = response.config.url;

    res.json({
      success: true,
      uploadUrl: uploadUrl,
      fileId: response.data.id
    });
  } catch (error) {
    console.error('生成上傳網址時發生錯誤:', error);
    res.status(500).json({ 
      error: '無法生成上傳網址', 
      details: error.message 
    });
  }
});

// 確認上傳完成的 API
app.post('/api/confirm-upload', async (req, res) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: '缺少檔案 ID' });
    }

    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    // 獲取檔案資訊
    const response = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });

    res.json({
      success: true,
      file: {
        id: response.data.id,
        name: response.data.name,
        link: response.data.webViewLink
      }
    });
  } catch (error) {
    console.error('確認上傳時發生錯誤:', error);
    res.status(500).json({ 
      error: '確認上傳失敗', 
      details: error.message 
    });
  }
});

// Catch-all 路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`伺服器運行在端口 ${PORT}`);
});

module.exports = app;