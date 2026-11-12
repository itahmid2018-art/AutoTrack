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
    const { issueDescription, vehicleOrDevice, category, availableParts, jobCard } = req.body;

    const deviceModel = jobCard ? `${jobCard.tool?.brand || ''} ${jobCard.tool?.modelNumber || ''}` : (vehicleOrDevice || 'Bosch Power Tool');
    const deviceCategory = jobCard ? (jobCard.tool?.category || 'Power Tool') : (category || 'General Tool');
    const grievanceCategory = jobCard ? (jobCard.serviceReq?.grievanceCategory || 'Issue') : '';
    const grievanceComplaint = jobCard ? (jobCard.serviceReq?.detailedComplaint || issueDescription) : (issueDescription || 'Needs inspection');
    const voltagePower = jobCard ? (jobCard.tool?.voltageRating || '230V') : '';

    const prompt = `You are a Senior Master Certified Bosch & Power Tools Master Diagnostic Engineer.

Device Model: ${deviceModel}
Category: ${deviceCategory}
Voltage/Power: ${voltagePower}
Customer Grievance Category: "${grievanceCategory}"
Customer Detailed Complaint: "${grievanceComplaint}"

Available Genuine Spare Parts Sample Catalog (${(availableParts || []).length} items):
${JSON.stringify((availableParts || []).slice(0, 50), null, 2)}

Diagnose the fault and return structured JSON:
1. Probable Root Cause Analysis (explain mechanical or electrical failure mechanisms)
2. Common Repair Procedures & Action Steps (numbered step-by-step workshop workbench repair steps)
3. Estimated Repair Labor Hours (numeric, e.g. 1.5)
4. Recommended Replacement Parts needed from the catalog sample (list partId, sku, name, quantity, and specific reason)
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

// Server-side AI Interactive Diagnostic Chatbot Endpoint
app.post('/api/ai/repair-chat', async (req, res) => {
  try {
    const { messages, jobCardContext, availableParts } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const tool = jobCardContext?.tool || {};
    const serviceReq = jobCardContext?.serviceReq || {};

    const systemInstruction = `You are a Senior Master Certified Bosch & Vendor Power Tool Diagnostic Specialist Assistant.
You are assisting a service technician on the workshop workbench.

Job Ticket Context:
- Ticket ID: ${jobCardContext?.id || 'N/A'}
- Tool Brand & Model: ${tool.brand || 'Bosch'} ${tool.modelNumber || 'Power Tool'}
- Serial Number: ${tool.serialNumber || 'N/A'} (${tool.voltageRating || '230V'})
- Physical Condition: ${tool.physicalCondition || 'Used'}
- Customer Grievance Category: "${serviceReq.grievanceCategory || 'General Issue'}"
- Detailed Complaint: "${serviceReq.detailedComplaint || 'Needs inspection'}"
- Diagnostic Log: "${jobCardContext?.diagnosticNotes || 'None'}"

Parts Catalog Sample (SKU, Name, UnitPrice):
${JSON.stringify((availableParts || []).slice(0, 35), null, 2)}

Instructions:
1. Provide concise, expert workshop guidance specific to this tool model and complaint.
2. Detail precise multimeter tests, mechanical teardown steps, commutator/brush wear checks, or gearbox grease requirements.
3. If spare parts are needed, cite exact SKUs (e.g. BRSH-1002, ARM-1009) from the catalog sample so the technician can link them.
4. Keep advice clear, direct, and actionable for bench technicians.`;

    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { role: 'user', parts: [{ text: `[SYSTEM CONTEXT]: Tool Model: ${tool.brand} ${tool.modelNumber}. Grievance: ${serviceReq.grievanceCategory} - ${serviceReq.detailedComplaint}` }] },
        ...contents,
      ],
      config: {
        systemInstruction,
      },
    });

    const reply = response.text || 'Unable to generate diagnostic response.';
    return res.json({ reply });
  } catch (error: any) {
    console.error('Gemini Repair Chat Error:', error);
    return res.status(500).json({ error: 'Failed to generate repair chat response', details: error.message });
  }
});

// Server-side AI Inventory Reorder Recommendation Endpoint
app.post('/api/ai/recommend-reorders', async (req, res) => {
  try {
    const { jobCards = [], inventory = [] } = req.body;

    const sampleJobs = jobCards.slice(0, 50).map((j: any) => ({
      tool: `${j.tool?.brand || ''} ${j.tool?.modelNumber || ''}`,
      category: j.tool?.category || '',
      grievance: j.serviceReq?.grievanceCategory || '',
      complaint: j.serviceReq?.detailedComplaint || '',
      partsUsed: j.parts ? j.parts.map((p: any) => `${p.sku} (${p.name}) x${p.quantity}`) : []
    }));

    const sampleInventory = inventory.slice(0, 70).map((i: any) => ({
      id: i.id,
      sku: i.sku,
      name: i.name,
      category: i.category,
      stockQty: i.stockQty,
      minStockThreshold: i.minStockThreshold,
      costPrice: i.costPrice,
      brand: i.brand,
      compatibleModels: i.compatibleModels
    }));

    const prompt = `Analyze the following power tool service center repair history and current spare parts inventory to generate an AI predictive reorder recommendation.

Repair History Sample (${sampleJobs.length} recent job cards):
${JSON.stringify(sampleJobs, null, 2)}

Inventory Stock Sample (${sampleInventory.length} key parts):
${JSON.stringify(sampleInventory, null, 2)}

Task & Failure Pattern Analysis Rules:
1. Detect common tool failure patterns (e.g. Motor Sparking -> carbon brushes / armatures, Lost Impact -> SDS seals & impact grease, Dead Switch -> paddle switch & cordsets, Gearbox Noise -> planetary gear sets & bearings).
2. Cross-reference repair ticket grievances with current stock levels. Identify parts that are low OR expected to run out soon based on predicted failure velocity.
3. Recommend exact reorder quantities, urgency levels (CRITICAL, HIGH, MEDIUM, LOW), reasoning based on tool symptoms, and estimated PO cost.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are a Senior Bosch Master Service Inventory Specialist. Respond ONLY with valid structured JSON matching the declared schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryInsight: { type: Type.STRING },
            failurePatternsDetected: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  symptom: { type: Type.STRING },
                  typicalToolModels: { type: Type.ARRAY, items: { type: Type.STRING } },
                  associatedParts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  riskLevel: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                }
              }
            },
            reorderRecommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  partId: { type: Type.STRING },
                  sku: { type: Type.STRING },
                  name: { type: Type.STRING },
                  currentStock: { type: Type.INTEGER },
                  minStockThreshold: { type: Type.INTEGER },
                  suggestedReorderQty: { type: Type.INTEGER },
                  urgency: { type: Type.STRING },
                  predictedDefectPattern: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  costPrice: { type: Type.NUMBER },
                  estimatedTotalCost: { type: Type.NUMBER },
                  suggestedSupplier: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('AI Reorder Recommendation Error:', error);
    return res.status(500).json({ error: 'Failed to generate AI reorder recommendations', details: error.message });
  }
});

// Server-side Messaging API Credentials Status Check Endpoint
app.get('/api/messaging/status', (req, res) => {
  const twilioSmsConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );

  const twilioWhatsAppConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER
  );

  const metaWhatsAppConfigured = Boolean(
    process.env.WHATSAPP_CLOUD_API_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID
  );

  return res.json({
    twilioSmsConfigured,
    twilioWhatsAppConfigured,
    metaWhatsAppConfigured,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
    twilioWhatsAppNumber: process.env.TWILIO_WHATSAPP_NUMBER || null,
    whatsappCloudConfigured: metaWhatsAppConfigured,
    activeMode: (twilioSmsConfigured || twilioWhatsAppConfigured || metaWhatsAppConfigured) 
      ? 'REST API Direct Dispatch Enabled' 
      : 'Native Browser Scheme (wa.me / sms:) Fallback Active',
  });
});

// Server-side Send SMS via Twilio REST API Endpoint
app.post('/api/messaging/send-sms', async (req, res) => {
  try {
    const { to, message, jobId } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Recipient phone number (to) and message text are required.' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.json({
        success: false,
        apiConfigured: false,
        channel: 'SMS',
        provider: 'Device SMS Native Fallback',
        message: 'Twilio SMS API credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are not present in environment variables. Use client native browser SMS link.',
        fallbackUrl: `sms:${to}?body=${encodeURIComponent(message)}`,
      });
    }

    // Call Twilio REST API via HTTP basic auth
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', fromNumber);
    params.append('Body', message);

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const twilioData: any = await twilioRes.json();
    if (!twilioRes.ok) {
      return res.status(twilioRes.status).json({
        success: false,
        apiConfigured: true,
        provider: 'Twilio REST API',
        error: twilioData.message || 'Twilio SMS Dispatch Failed',
        code: twilioData.code,
      });
    }

    return res.json({
      success: true,
      apiConfigured: true,
      channel: 'SMS',
      provider: 'Twilio REST API',
      sid: twilioData.sid,
      status: twilioData.status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Twilio SMS API Error:', error);
    return res.status(500).json({ error: 'Failed to send SMS via Twilio API', details: error.message });
  }
});

// Server-side Send WhatsApp via Twilio or Meta WhatsApp Cloud API Endpoint
app.post('/api/messaging/send-whatsapp', async (req, res) => {
  try {
    const { to, message, jobId } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Recipient phone number (to) and message text are required.' });
    }

    const cleanPhone = to.replace(/[^0-9]/g, '');

    // 1. Check Twilio WhatsApp
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_NUMBER;

    if (twilioAccountSid && twilioAuthToken && twilioWhatsAppFrom) {
      const fromFormatted = twilioWhatsAppFrom.startsWith('whatsapp:') ? twilioWhatsAppFrom : `whatsapp:${twilioWhatsAppFrom}`;
      const toFormatted = `whatsapp:${cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone}`;

      const params = new URLSearchParams();
      params.append('To', toFormatted);
      params.append('From', fromFormatted);
      params.append('Body', message);

      const authHeader = 'Basic ' + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const twilioData: any = await twilioRes.json();
      if (!twilioRes.ok) {
        return res.status(twilioRes.status).json({
          success: false,
          apiConfigured: true,
          provider: 'Twilio WhatsApp API',
          error: twilioData.message || 'Twilio WhatsApp API Error',
        });
      }

      return res.json({
        success: true,
        apiConfigured: true,
        channel: 'WhatsApp',
        provider: 'Twilio WhatsApp API',
        sid: twilioData.sid,
        status: twilioData.status,
      });
    }

    // 2. Check Meta WhatsApp Cloud API
    const metaToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (metaToken && metaPhoneId) {
      const metaRes = await fetch(`https://graph.facebook.com/v18.0/${metaPhoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: { body: message },
        }),
      });

      const metaData: any = await metaRes.json();
      if (!metaRes.ok) {
        return res.status(metaRes.status).json({
          success: false,
          apiConfigured: true,
          provider: 'Meta WhatsApp Cloud API',
          error: metaData.error?.message || 'Meta WhatsApp Cloud API Error',
        });
      }

      return res.json({
        success: true,
        apiConfigured: true,
        channel: 'WhatsApp',
        provider: 'Meta WhatsApp Cloud API',
        messageId: metaData.messages?.[0]?.id,
      });
    }

    // 3. Fallback to 1-Click WhatsApp Web link
    return res.json({
      success: false,
      apiConfigured: false,
      channel: 'WhatsApp',
      provider: 'WhatsApp Web 1-Click Link Fallback',
      message: 'No Twilio or Meta WhatsApp API keys set in environment. Use WhatsApp Web 1-Click deep link.',
      fallbackUrl: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
    });
  } catch (error: any) {
    console.error('WhatsApp API Error:', error);
    return res.status(500).json({ error: 'Failed to send WhatsApp message via API', details: error.message });
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
