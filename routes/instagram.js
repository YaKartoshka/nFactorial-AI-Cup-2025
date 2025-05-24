

const express = require('express');
const router = express.Router();
const request = require('request');
const async = require('async');
const integr = require('../libs/integrations.js');
const path = require('path')
const multer = require('multer');
const fs = require('fs')
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, "temp/");
  },
  filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `recording_${Date.now()}${ext}`);
  },
});

const upload = multer({
  limits: { fileSize: 100 * 1024 * 1024 }, // 10MB limit,
  storage: storage
});

getInstagramSettings = function () {
  return new Promise((resolve, reject) => {
    if (settingsCache['instagram_settings']) return resolve(settingsCache['instagram_settings']);
    kvStorageGet('instagram_settings', true, function (x) {
      var instagram_settings = (x && x.value) ? x.value : null;
      resolve(instagram_settings)
    });
  });
}




router.post('/api', upload.single("audio"), async function(req, res, next){

    res.header("Content-Type", "application/json; charset=utf-8");  
    var action = req.body.action, r = {r:200};
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
              'Authorization': 'Bearer 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'
            },
            body: JSON.stringify({
              model: "llama3-70b-8192",
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



})


function readInstagramData() {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeInstagramData(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function updateInstagramData(updates) {
  const current = readInstagramData();
  const updated = { ...current, ...updates };
  writeInstagramData(updated);
}

module.exports = router;