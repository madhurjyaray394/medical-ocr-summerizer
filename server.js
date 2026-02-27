const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// API keys are now securely loaded from .env file
const OCR_API_KEY = process.env.OCR_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Set up server to serve your HTML/CSS/JS files from the "public" folder
app.use(express.static('public'));

// Note: On Vercel, the filesystem is read-only except for /tmp
const uploadDir = os.tmpdir();

// Set up Multer to handle image uploads, keeping original file extensions
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        // Keep the original extension (e.g. .jpg, .png)
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// This route handles the image upload from the frontend
app.post('/api/scan', upload.single('medicineImage'), async (req, res) => {
    try {
        // 1. Check if a file was actually uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        // 2. Prepare the image file to send to OCR.space API
        const formData = new FormData();
        // Append the file using fs.createReadStream
        formData.append('file', fs.createReadStream(req.file.path));
        formData.append('language', 'eng');
        formData.append('isOverlayRequired', 'false');

        // 3. Send the image to OCR.space API
        console.log("Sending image to OCR API...");
        const ocrResponse = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: {
                ...formData.getHeaders(),
                'apikey': OCR_API_KEY
            }
        });

        // 4. Extract the text from the response
        let extractedText = '';
        if (ocrResponse.data && ocrResponse.data.ParsedResults && ocrResponse.data.ParsedResults.length > 0) {
            extractedText = ocrResponse.data.ParsedResults[0].ParsedText;
        }

        // 5. Clean up the temporary uploaded image from our server
        fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting temp file:", err);
        });

        // 6. Handle cases where no text was found or an API error occurred
        if (!extractedText || ocrResponse.data.IsErroredOnProcessing) {
            return res.status(400).json({
                error: ocrResponse.data.ErrorMessage ? ocrResponse.data.ErrorMessage.join(', ') : 'Could not read any text from the image.'
            });
        }

        console.log("OCR Extracted Text:\n", extractedText);

        let extractedMedicineName = "Unknown";
        let usage = "Information not found.";
        let warnings = "Information not found.";

        try {
            console.log("Asking OpenRouter to analyze the OCR text...");

            const prompt = `
            You are a medical assistant looking at text extracted from a medicine box or bottle using OCR.
            Here is the raw text:
            """
            ${extractedText}
            """
            
            Based on this text, please identify the actual name of the medicine.
            Once you identify the medicine name from the text, use your general knowledge to provide:
            1. The name of the medicine.
            2. What the medicine is commonly used for (indications). Keep it simple and easy to understand.
            3. Common major warnings, side effects, or precautions for this medicine. Do not just say "none listed in text". You must provide actual warnings for the drug you identified.
            
            Return your answer STRICTLY as a JSON object with these exact keys: "name", "usage", "warnings".
            Do not include any formatting like Markdown code blocks (json). Just return the raw JSON object.
            `;

            let aiText = "";
            let retryCount = 0;
            const maxRetries = 1;

            while (retryCount <= maxRetries) {
                try {
                    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: 'google/gemini-2.5-flash',
                        messages: [
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        max_tokens: 300
                    }, {
                        headers: {
                            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                            'HTTP-Referer': 'http://localhost:3000', // Optional, for OpenRouter rankings
                            'X-Title': 'Medicine Search App', // Optional
                            'Content-Type': 'application/json'
                        }
                    });

                    aiText = response.data.choices[0].message.content.trim();
                    break; // Success, exit loop
                } catch (err) {
                    retryCount++;
                    if (retryCount > maxRetries) {
                        throw err; // Out of retries, throw the error down to the outer catch block
                    }
                    console.log("OpenRouter API failed, retrying in 1 second...");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Cleanup any accidental markdown block formatting just in case
            if (aiText.startsWith('```json')) {
                aiText = aiText.substring(7);
            }
            if (aiText.startsWith('```')) {
                aiText = aiText.substring(3);
            }
            if (aiText.endsWith('```')) {
                aiText = aiText.substring(0, aiText.length - 3);
            }

            const aiData = JSON.parse(aiText.trim());

            extractedMedicineName = aiData.name || "Unknown";
            usage = aiData.usage || "Information not found.";
            warnings = aiData.warnings || "Information not found.";

            console.log("OpenRouter successfully analyzed the medicine!");

        } catch (aiError) {
            console.error("OpenRouter API Error:", aiError.response ? aiError.response.data : aiError.message);
            usage = "Could not analyze the medicine automatically. Please check your OpenRouter API key.";
        }

        // 7. Send everything back to the frontend
        res.json({
            extractedText: extractedText,
            medicineName: extractedMedicineName,
            usage: usage,
            warnings: warnings
        });

    } catch (error) {
        console.error("Server Error:", error);

        // Clean up temp file on error just in case
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, () => { });
        }

        res.status(500).json({ error: 'An internal server error occurred during processing.' });
    }
});

// Export the app for Vercel
module.exports = app;

// Start the server locally
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running at http://localhost:${port}`);
    });
}
