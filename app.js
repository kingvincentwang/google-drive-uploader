// app.js - 主應用程式
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件設置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 配置 multer 用於處理文件上傳
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 限制文件大小為 10MB
});

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

// 上傳檔案到 Google Drive
async function uploadFileToDrive(filePath, fileName, folderId) {
  try {
    console.log(`開始上傳文件: ${fileName} 到資料夾: ${folderId}`);
    console.log(`本地文件路徑: ${filePath}`);
    
    // 確認檔案存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`本地檔案不存在: ${filePath}`);
    }
    
    // 處理檔案名稱編碼
    const encodedFileName = Buffer.from(fileName, 'binary').toString('utf8');
    console.log(`處理後的檔案名稱: ${encodedFileName}`);
    
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: encodedFileName,
      parents: [folderId]
    };

    console.log('準備上傳檔案到 Google Drive...');
    
    const media = {
      mimeType: 'application/octet-stream',
      body: fs.createReadStream(filePath)
    };

    try {
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
      });
      
      console.log('檔案成功上傳到 Google Drive:', response.data);
      return response.data;
    } catch (driveError) {
      console.error('Google Drive API 錯誤:', driveError);
      
      if (driveError.response) {
        console.error('API 回應錯誤:', driveError.response.data);
      }
      
      throw new Error(`Google Drive 上傳失敗: ${driveError.message}`);
    }
  } catch (error) {
    console.error(`上傳檔案 ${fileName} 到 Google Drive 時發生錯誤:`, error);
    throw error;
  }
}

// API 路由
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '沒有檔案被上傳' });
  }

  try {
    const { folderId } = req.body;
    
    // 檢查是否提供了資料夾 ID
    if (!folderId) {
      return res.status(400).json({ error: '缺少 Google Drive 資料夾 ID' });
    }

    const fileData = await uploadFileToDrive(
      req.file.path,
      req.file.originalname,
      folderId
    );

    // 上傳完成後刪除本地檔案
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: '檔案上傳成功',
      file: {
        id: fileData.id,
        name: fileData.name,
        link: fileData.webViewLink
      }
    });
  } catch (error) {
    console.error('處理上傳時發生錯誤:', error);
    res.status(500).json({ error: '上傳處理失敗', details: error.message });
  }
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`伺服器運行在端口 ${PORT}`);
});
