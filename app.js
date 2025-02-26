const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const cors = require('cors');
const stream = require('stream');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中間件設置
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 使用內存儲存方式而非磁盤儲存
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 限制上傳到 10MB
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

// 根路徑路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 修改上傳 API 以使用流處理
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
    
    // 創建一個可讀的流來處理文件緩衝區
    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);
    
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    
    const fileMetadata = {
      name: req.file.originalname,
      parents: [folderId]
    };
    
    const media = {
      mimeType: req.file.mimetype,
      body: bufferStream
    };
    
    // 上傳檔案到 Google Drive
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    res.json({
      success: true,
      message: '檔案上傳成功',
      file: {
        id: response.data.id,
        name: response.data.name,
        link: response.data.webViewLink
      }
    });
  } catch (error) {
    console.error('處理上傳時發生錯誤:', error);
    res.status(500).json({ error: '上傳處理失敗', details: error.message });
  }
});

// 當檔案過大時用於分塊上傳的端點
app.post('/api/upload-chunked', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  try {
    const { fileName, mimeType, folderId, chunkIndex, totalChunks, uploadId } = req.query;
    
    // 使用 uploadId 作為暫存檔案名稱的一部分
    const tempFilePath = path.join('/tmp', `${uploadId}_${fileName}`);
    
    // 將此塊添加到臨時文件
    const chunkData = req.body;
    
    // 對於第一個塊，創建新文件；對於後續塊，附加到現有文件
    if (chunkIndex === '0') {
      fs.writeFileSync(tempFilePath, chunkData);
    } else {
      fs.appendFileSync(tempFilePath, chunkData);
    }
    
    // 檢查是否是最後一個塊
    if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
      // 所有塊都已接收，上傳到 Google Drive
      const auth = getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      
      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      };
      
      const media = {
        mimeType: mimeType || 'application/octet-stream',
        body: fs.createReadStream(tempFilePath)
      };
      
      // 上傳整個文件
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
      });
      
      // 上傳後刪除臨時文件
      fs.unlinkSync(tempFilePath);
      
      res.json({
        success: true,
        message: '檔案上傳成功',
        file: {
          id: response.data.id,
          name: response.data.name,
          link: response.data.webViewLink
        }
      });
    } else {
      // 不是最後一個塊，告知客戶端繼續
      res.json({
        success: true,
        message: `接收到塊 ${chunkIndex}/${totalChunks - 1}`
      });
    }
  } catch (error) {
    console.error('處理分塊上傳時發生錯誤:', error);
    res.status(500).json({ error: '分塊上傳處理失敗', details: error.message });
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