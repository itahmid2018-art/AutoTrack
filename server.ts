import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Server-side Gemini Power Tool Fault Diagnosis Endpoint
app.post('/api/ai/diagnose', async (req, res) => {
  try {
    const { issueDescription, vehicleOrDevice, category, availableParts } = req.body;

    if (!issueDescription) {
      return res.status(400).json({ error: 'Issue description is required' });
    }

    const prompt = `You are a Senior Bosch Power Tools Master Certified Diagnostic Technician.
Tool/Device: ${vehicleOrDevice || 'Bosch Power Tool'} (Category: ${category || 'General Tool'})
Customer Grievance & Complaint: "${issueDescription}"

Available Genuine Spare Parts Sample Catalog (ID, SKU, Name, UnitPrice):
${JSON.stringify((availableParts || []).slice(0, 40), null, 2)}

Diagnose the fault and return structured JSON:
1. Probable Root Cause Analysis
2. Recommended Action Steps (array of strings)
3. Estimated Repair Labor Hours (numeric, e.g. 1.5)
4. Recommended Replacement Parts from the catalog sample (list partId, sku, name, quantity, and reason)
5. Technical Notes for Service Ticket`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Respond ONLY with valid structured JSON matching the declared schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            probableCause: { type: Type.STRING },
            recommendedSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            estimatedLaborHours: { type: Type.NUMBER },
            recommendedParts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  partId: { type: Type.STRING },
                  sku: { type: Type.STRING },
                  name: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                  reason: { type: Type.STRING },
                },
              },
            },
            techNotes: { type: Type.STRING },
          },
        },
      },
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Gemini Tool Diagnosis Error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI tool diagnosis',
      details: error.message,
    });
  }
});

// Server-side Customer Message Generator
app.post('/api/ai/generate-message', async (req, res) => {
  try {
    const { jobCard, messageType, language = 'English', tone = 'Professional & Direct' } = req.body;

    const prompt = `Write a short SMS/WhatsApp notification for a Bosch power tool service center customer.
Language: ${language}
Tone: ${tone}
Goal: ${messageType}
Job Ticket Info:
- Ticket ID: ${jobCard?.id}
- Customer: ${jobCard?.customerName}
- Tool: ${jobCard?.tool?.brand} ${jobCard?.tool?.modelNumber}
- Status: ${jobCard?.status}
- Estimate Total: $${jobCard?.totalAmount?.toFixed(2) || '0.00'}

Keep under 220 characters. Include clear call to action.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    return res.json({ message: response.text?.trim() || '' });
  } catch (error: any) {
    console.error('Gemini Message Error:', error);
    return res.status(500).json({ error: 'Failed to generate message', details: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, () => {
    console.log(`BOSCH Service Center Server running on http://localhost:${PORT}`);
  });
}

startServer();
