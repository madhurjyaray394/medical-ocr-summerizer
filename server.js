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

        // 2. Read the image file and convert to base64
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = req.file.mimetype; // e.g., 'image/jpeg', 'image/png'

        // 3. Prepare the payload for OpenRouter using the Vision format
        console.log("Asking OpenRouter Gemini Vision to read and analyze the medicine image...");

        let extractedMedicineName = "Unknown";
        let usage = "Information not found.";
        let warnings = "Information not found.";
        let extractedText = "Text extraction handled natively by Gemini Vision.";

        try {
            const prompt = `
            You are a medical assistant looking at an image of a medicine box or bottle.
            Please read the text on the package to identify the actual name of the medicine.
            
            Based on the medicine you identify in the image, use your general medical knowledge to provide:
            1. The name of the medicine.
            2. What the medicine is commonly used for (indications). Keep it simple and easy to understand.
            3. Common major warnings, side effects, or precautions for this medicine. Do not just say "none listed". Provide actual common warnings for the drug you identified.
            
            Return your answer STRICTLY as a JSON object with these exact keys: "name", "usage", "warnings".
            Do not include any formatting like Markdown code blocks (json). Just return the raw JSON object.
            `;

            let aiText = "";
            let retryCount = 0;
            const maxRetries = 1;

            while (retryCount <= maxRetries) {
                try {
                    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: 'google/gemini-2.0-flash-001',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: "text",
                                        text: prompt
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:${mimeType};base64,${base64Image}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 500
                    }, {
                        headers: {
                            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                            'HTTP-Referer': 'http://localhost:3000', // Optional, for OpenRouter rankings
                            'X-Title': 'Medicine Search App', // Optional
                            'Content-Type': 'application/json'
                        }
                    });

                    aiText = response.data.choices[0].message.content.trim();
                    console.log("OpenRouter raw response:", aiText);
                    break; // Success, exit loop
                } catch (err) {
                    retryCount++;
                    const errorDetail = err.response ? JSON.stringify(err.response.data) : err.message;
                    console.error(`OpenRouter API attempt ${retryCount} failed:`, errorDetail);

                    if (retryCount > maxRetries) {
                        throw err; // Out of retries, throw the error
                    }
                    console.log("Retrying in 1 second...");
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
            console.error("Analysis Error Detail:", aiError.response ? aiError.response.data : aiError.message);
            usage = "Could not analyze the medicine automatically. Please check your OpenRouter API key or model availability.";
        }

        // 7. Send everything back to the frontend
        res.json({
            extractedText: extractedText,
            medicineName: extractedMedicineName,
            usage: usage,
            warnings: warnings
        });

    } catch (error) {
        console.error("Full Server Error Stack:", error);
        res.status(500).json({ error: 'An internal server error occurred during processing. Check server console for details.' });
    } finally {
        // ALWAYS clean up temp file, regardless of success or error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Error deleting temp file in finally block:", err);
            });
        }
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
