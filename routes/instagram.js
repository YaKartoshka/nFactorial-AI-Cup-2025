
const express = require('express');
const router = express.Router();
const {toFile} = require('openai')
const request = require('request');
const axios = require('axios');
const FormData = require('form-data');  
const path = require('path')
const multer = require('multer');
const fs = require('fs')
const {createReadStream} = require('fs')
const { resolve } = require('path')
const instaProfilePath = path.join(__dirname, '..', 'insta_profile.json');
const instaDataPath = path.join(__dirname, '..', 'insta_data.json');
const instaMenuPath = path.join(__dirname, '..', 'insta_menu.json');
const DB_FILE  = path.join(__dirname, '..', 'insta_chats.json');
const XLSX = require('xlsx');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `recording_${Date.now()}${ext}`);
  },
});

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "temp/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Только Excel-файлы разрешены'));
    }
    cb(null, 'database.xlsx'); // всегда одно имя
  }
});

const uploadExcel = multer({ storage: excelStorage });

const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 10MB limit,
  storage: storage
});


router.post('/', function (req, res) {
  const event = req.body.event;
  const sender = event.sender.id;
  const recipient = event.recipient.id;

  let text = null;
  if (event.message && event.message.text) {
    text = event.message.text;
  }

  if (!text) {
    return res.sendStatus(200);
  }

  getChat(sender, function (chat_data) {
    if (!chat_data) {
      // Create chat if doesn't exist
      return createChat(sender, 1, function () {
        const instagram_settings = readInstagramData(instaMenuPath)
          if (instagram_settings) {
            const welcome = instagram_settings.instagram_welcome_message;
            const menu_options = instagram_settings.menu_options || [];
            if (welcome) {
              addMessage(sender, 'bot', welcome);
              instagramSendMessage(sender, recipient, welcome, menu_options);
            }
          }
      
      });
    }

    // Chat exists: save user message
    addMessage(sender, 'user', text);

    // Continue with logic
    const instagram_settings = readInstagramData(instaMenuPath)
    console.log(instaMenuPath)
      const menu_options = instagram_settings.menu_options || [];

      // Check if user text matches a menu option
      const targetOption = menu_options.find(
        m => m.key.toLowerCase() === text.toLowerCase()
      );

      if (targetOption) {
        const botMessage = targetOption.value;
        addMessage(sender, 'bot', botMessage);
        instagramSendMessage(sender, recipient, botMessage, menu_options);
      } else {
        // 🔥 User typed free text — use GroqCloud
        getGroqResponse(text).then(botReply => {
          addMessage(sender, 'bot', botReply);
          instagramSendMessage(sender, recipient, botReply, menu_options);
        }).catch(err => {
          console.error('Groq error:', err.message);
        });
      }
 
  });

  res.sendStatus(200);
});


async function getGroqResponse(userText, data='') {
  const filePath = path.join(__dirname, '..', 'temp', 'database.xlsx');

  const textFromExcel = extractTextFromExcel(filePath) || '';
  // Prepare the system message with Excel data context
  let systemMessage = 'Ты ассистент для пользователей в Instagram.';
  
  if (textFromExcel) {
    systemMessage += `\n\nУ тебя есть доступ к следующим данным из базы данных:\n${textFromExcel}`;
  }
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile', // or llama3-70b, etc
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userText }
    ]
  }, {
    headers: {
      'Authorization': `Bearer `+process.env.GROQ_KEY,
      'Content-Type': 'application/json'
    }
  });

  return response.data.choices[0].message.content;
}


router.post('/api', upload.single("audio"), async function (req, res, next) {

  res.header("Content-Type", "application/json; charset=utf-8");
  var action = req.body.action, r = { r: 200 };
  console.log(action)
   
    if (action == "generateInfo") {
      const businessName = req.body.businessName;
      console.log(businessName);

      if (!businessName) {
        return res.status(400).json({ error: 'Business name is required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Файл не загружен" });
      }

      const audioFilePath = req.file.path;

      try {
        const transcription = await openai.audio.transcriptions.create({
          model: "whisper-1",
          file: fs.createReadStream(audioFilePath),
          language: "en",
        });

        console.log(transcription);
        const description = transcription.text;
        fs.unlinkSync(audioFilePath);

        // First prompt for short description
        const shortDescriptionPrompt = `
          Бизнес: "${businessName}"
          Описание: "${description}"
          ЗАДАЧА:
          Сгенерируй короткое и привлекательное описание бизнеса для шапки профиля в Instagram (не более 50 символов), добавить уникальное предложение.
          Пример формата:
          * Скидки до 50% до конца лета
          * Кофейня в центре города
          * Первым клиентам бонусы
          
          Ответь только описанием на русском языке без дополнительного текста.
          `;

        // Second prompt for business plan
        const businessPlanPrompt = `
          Бизнес: "${businessName}"
          Запрос: "${description}"
          ЗАДАЧА:
          Создай полноценный структурированный документ на русском языке на базе запроса.

          Валюта во всех расчетах — тенге (KZT).
          IMPORTANT: Текст на русском языке
          `;

        // Combined prompts configuration
        const promptsConfig = {
          shortDescription: {
            prompt: shortDescriptionPrompt,
            maxRetries: 3
          },
          businessPlan: {
            prompt: businessPlanPrompt,
            maxRetries: 3
          }
        };

        // Function to make API request
        async function makeApiRequest(prompt, retries = 3) {
          const options = {
            method: 'POST',
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer '+process.env.GROQ_KEY
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              messages: [
                {
                  role: "system",
                  content: ""
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            })
          };

          return new Promise((resolve, reject) => {
            function attemptRequest(attempt = 1) {
              request(options, function (error, response) {
                if (error) {
                  if (attempt < retries) {
                    console.log(`Request attempt ${attempt} failed, retrying...`);
                    return attemptRequest(attempt + 1);
                  }
                  return reject(new Error('Request failed after all retries'));
                }

                try {
                  const data = JSON.parse(response.body);
                  let result = data.choices[0].message.content;
                  result = result.replace(/\\_/g, "_");
                  resolve(result.trim());
                } catch (e) {
                  if (attempt < retries) {
                    console.log(`Parse attempt ${attempt} failed, retrying...`);
                    return attemptRequest(attempt + 1);
                  }
                  reject(new Error('Failed to parse response after all retries'));
                }
              });
            }
            attemptRequest();
          });
        }

        // Execute both prompts
        const [shortDescriptionResult, businessPlanResult] = await Promise.all([
          makeApiRequest(promptsConfig.shortDescription.prompt, promptsConfig.shortDescription.maxRetries),
          makeApiRequest(promptsConfig.businessPlan.prompt, promptsConfig.businessPlan.maxRetries)
        ]);

        // Combine results into JSON
        const combinedResult = {
          short_description: shortDescriptionResult,
          business_plan: businessPlanResult,
          transcription: transcription.text,
          businessName: businessName,
          generatedAt: new Date().toISOString()
        };

        // Add delay and send response
        setTimeout(() => {

          res.json(combinedResult);
        }, 5000); 

      } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({
          error: 'Failed to generate business information',
          details: error.message
        });
      }
    }

    else

    if (action == 'saveMenu'){
      const instagram_welcome_message = req.body.instagram_welcome_message;
      const menu_options = req.body.menu_options
      writeInstagramData(instaMenuPath, {instagram_welcome_message: instagram_welcome_message, menu_options:menu_options})
      res.send(JSON.stringify(r))
    }

    else

    if (action == 'getMenu'){
      const data = readInstagramData(instaMenuPath)
      res.json(data)
      
    }

    else

    if (action == 'getPosts'){
       const imagesDir = path.join(__dirname, '..', 'public/images');

        fs.readdir(imagesDir, (err, files) => {
          if (err) {
            return res.status(500).json({ error: 'Unable to read images directory' });
          }

          const instaImages = files
            .filter(file => file.startsWith('insta_'))
            .map(file => `/public/images/${file}`); // Adjust path for frontend

          res.json(instaImages);
        });
    }
})

router.post('/post', upload.single("image"), async function (req, res, next) {
try {
    const { description } = req.body;
    const imagePath = req.file.path;

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: await toFile(
        createReadStream(resolve(imagePath)),
        null,
        { type: 'image/png' },
      ),
      prompt: description,
      n: 1,
      size: "1024x1024",
     
    });

    fs.unlinkSync(imagePath);
    const image_base64 = response.data[0].b64_json;
    const image_bytes = Buffer.from(image_base64, "base64");
    fs.writeFileSync(path.join(__dirname, '..', 'public', 'images', `insta_post_${req.file.originalname}`), image_bytes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Image edit failed.' });
  }
})


function readInstagramData(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeInstagramData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}


router.post('/upload-excel', uploadExcel.single('file'), (req, res) => {

    res.json({ status: 'ok', message: 'Excel файл успешно загружен' });
  
});

instagramSendMessage = function(sender, recipient, message, buttons){ //global
  const sanitizedMessage = message.toString().trim();
  
  const quick_replies = buttons.map(b => ({
    content_type: "text",
    title: b.key.toString().trim(),
    payload: b.key.toString().trim()
  }));

  var messageData = {
    text: sanitizedMessage,
  };

  if(quick_replies.length) messageData['quick_replies'] = quick_replies
  var data = readInstagramData(instaProfilePath)
  return new Promise((resolve, reject) => {  
  request({
    url: `https://graph.instagram.com/v16.0/me/messages`,
    qs: {access_token:data.instagram_token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData
    },
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  }, function(error, response, body){
      if (error){
      console.error('ERR->instagramSendMessage.Error1:', error);          
      } else if (response.body.error){
      console.error('ERR->instagramSendMessage.Error2:', response.body.error);          
      }          
      resolve(error || response.body.error);
  });     
 
  });
}






function extractTextFromExcel(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('Файл Excel не найден.');
    }

    const workbook = XLSX.readFile(filePath);
    let text = '';

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // 2D-массив

        text += `\n=== Лист: ${sheetName} ===\n`;

        jsonData.forEach(row => {
            const rowText = row.map(cell => (cell !== undefined ? cell : '')).join('\t');
            text += rowText + '\n';
        });
    });

    return text.trim();
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ chats: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getChat(user_id, cb) {
  const db = loadDB();
 
  const chat = db.chats[user_id] || null;
  cb(chat);
}

function createChat(user_id, channel, cb) {
  const db = loadDB();
  const today = new Date().toISOString().split('T')[0];
  db.chats[user_id] = {
    user_id,
    channel,
    registration_date: today,
    messages: []
  };
  saveDB(db);
  cb(db.chats[user_id]);
}

function addMessage(user_id, from, text) {
  const db = loadDB();
  if (!db.chats[user_id]) return;
  db.chats[user_id].messages.push({ from, text });
  saveDB(db);
}


module.exports = router;