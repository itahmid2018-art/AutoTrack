import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));

// PII Sanitization Helper (Protects Customer Personal Identifiable Information before calling AI models)
function stripPII(text: string): string {
  if (!text) return '';
  // Mask phone numbers
  let sanitized = text.replace(/(\+?\d[0-9\-\s\(\)]{7,}\d)/g, '[REDACTED_PHONE]');
  // Mask email addresses
  sanitized = sanitized.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]');
  // Mask Tax/GST IDs
  sanitized = sanitized.replace(/(\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b)/g, '[REDACTED_TAX_ID]');
  return sanitized;
}

// In-Memory API Rate Limiter Middleware (Prevents API abuse and token exhaustion)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 50; // Max 50 requests per minute per IP

  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count += 1;
  }

  rateLimitMap.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests received from this client. Please wait 1 minute before retrying.',
    });
  }

  next();
};

app.use('/api/', rateLimiter);

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
    const grievanceComplaint = stripPII(jobCard ? (jobCard.serviceReq?.detailedComplaint || issueDescription) : (issueDescription || 'Needs inspection'));
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

// Server-side AI Response Assistant for Customer Inquiries in MessagingCenter
app.post('/api/ai/response-assistant', async (req, res) => {
  try {
    const {
      jobCard,
      customerInquiry,
      channel = 'WhatsApp',
      language = 'English',
      tone = 'Professional & Helpful',
      portalUrl,
      billingSummary,
    } = req.body;

    if (!jobCard) {
      return res.status(400).json({ error: 'Active JobCard context is required.' });
    }

    if (!customerInquiry || !String(customerInquiry).trim()) {
      return res.status(400).json({ error: 'Customer inquiry or prompt topic is required.' });
    }

    const partsList = Array.isArray(jobCard.parts)
      ? jobCard.parts.map((p: any) => `${p.name} (${p.sku}) x${p.quantity} = $${Number(p.total || 0).toFixed(2)}`)
      : [];

    const opExList = Array.isArray(jobCard.operationalExpenses)
      ? jobCard.operationalExpenses.map((e: any) => `${e.category}: ${e.description} ($${Number(e.amount || 0).toFixed(2)})`)
      : [];

    const partsSubtotal = billingSummary?.partsSubtotal ?? (Array.isArray(jobCard.parts) ? jobCard.parts.reduce((s: number, p: any) => s + Number(p.total || 0), 0) : 0);
    const laborSubtotal = billingSummary?.laborSubtotal ?? ((jobCard.laborHours || 0) * (jobCard.laborRate || 0));
    const opExSubtotal = billingSummary?.operationalExpensesSubtotal ?? (Array.isArray(jobCard.operationalExpenses) ? jobCard.operationalExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) : 0);
    const taxAmount = billingSummary?.taxAmount ?? 0;
    const totalAmount = billingSummary?.totalAmount ?? jobCard.totalAmount ?? 0;

    const warrantySummary = jobCard.tool?.warrantyAdjudication
      ? `${jobCard.tool.warrantyAdjudication.flag} (${jobCard.tool.warrantyAdjudication.reason})`
      : `${jobCard.tool?.warrantyFlag || jobCard.tool?.warrantyStatus || 'Unconfirmed'}`;

    const prompt = `You are an expert Service Center Customer Support Coordinator replying to a customer inquiry via ${channel}.
Language: ${language}
Tone: ${tone}

Customer Inquiry to Answer:
"${stripPII(String(customerInquiry))}"

Verified Job Card Record Facts:
- Job Ticket ID: ${jobCard.id}
- Customer First/Name: ${jobCard.customerName}
- Tool Brand & Model: ${jobCard.tool?.brand || 'Bosch'} ${jobCard.tool?.modelNumber || ''}
- Serial Number: ${jobCard.tool?.serialNumber || 'N/A'}
- Current Workshop Stage / Status: ${jobCard.status} (Priority: ${jobCard.priority})
- Assigned Technician: ${jobCard.technician || 'Bench Specialist'}
- Intake Date: ${jobCard.intakeDate}
- Promised Completion: ${jobCard.promisedCompletion}
- Reported Issue: ${jobCard.serviceReq?.grievanceCategory || ''} - ${stripPII(jobCard.serviceReq?.detailedComplaint || '')}
- Diagnostic Notes Summary: ${stripPII(jobCard.diagnosticNotes || 'Pending bench evaluation')}
- Warranty Status: ${warrantySummary}
- Pre-Approved Repair Limit: $${Number(jobCard.serviceReq?.preApprovedLimit || 0).toFixed(2)}
- Labor: ${jobCard.laborHours || 0} hrs @ $${Number(jobCard.laborRate || 0).toFixed(2)}/hr = $${Number(laborSubtotal).toFixed(2)}
- Spare Parts (${partsList.length}): ${partsList.length > 0 ? partsList.join('; ') : 'None billed yet'} (Subtotal: $${Number(partsSubtotal).toFixed(2)})
- Operational Expenses (${opExList.length}): ${opExList.length > 0 ? opExList.join('; ') : 'None'} (Subtotal: $${Number(opExSubtotal).toFixed(2)})
- Discount: $${Number(jobCard.discount || 0).toFixed(2)}
- Sales Tax (${jobCard.taxRate || 0}%): $${Number(taxAmount).toFixed(2)}
- Effective Total Amount: $${Number(totalAmount).toFixed(2)}
${portalUrl ? `- Customer Live Status Tracking Link: ${portalUrl}` : ''}

Instructions:
1. Craft a clear, accurate primary "recommendedReply" strictly grounded in the verified Job Card facts above (never invent prices, dates, or parts not listed).
2. Provide 2 helpful "alternateReplies" tailored to common support needs (one concise SMS-ready option under 160 characters if possible, and one detailed polite WhatsApp option with exact cost/stage clarity).
3. List up to 4 concise "keyFactsCited" referencing exact data points used from the JobCard.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: 'Respond ONLY with valid structured JSON matching the schema. Ground all figures and statuses strictly in the supplied JobCard facts.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedReply: { type: Type.STRING },
            alternateReplies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
            keyFactsCited: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      recommendedReply: parsed.recommendedReply || '',
      alternateReplies: Array.isArray(parsed.alternateReplies) ? parsed.alternateReplies : [],
      keyFactsCited: Array.isArray(parsed.keyFactsCited) ? parsed.keyFactsCited : [],
    });
  } catch (error: any) {
    console.error('Gemini Response Assistant Error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI response suggestions',
      details: error.message,
    });
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

// Server-side Gemini Recommended Parts Analysis for a specific Job Card
app.post('/api/ai/recommend-parts', async (req, res) => {
  try {
    const { tool, serviceReq, diagnosticNotes, availableParts = [] } = req.body;

    if (!tool || !serviceReq) {
      return res.status(400).json({ error: 'Tool details and reported complaint are required.' });
    }

    if (!Array.isArray(availableParts) || availableParts.length === 0) {
      return res.status(400).json({ error: 'Available inventory catalog items are required for recommendation.' });
    }

    const sanitizedComplaint = stripPII(serviceReq.detailedComplaint || '');
    const sanitizedNotes = stripPII(diagnosticNotes || '');

    // Pre-rank catalog items so the model sees the most model- and symptom-relevant parts first
    const modelTokens = `${tool.brand || ''} ${tool.modelNumber || ''} ${tool.category || ''}`
      .toLowerCase()
      .split(/[\s/\-(),]+/)
      .filter((t) => t.length >= 2);

    const symptomText = `${serviceReq.grievanceCategory || ''} ${sanitizedComplaint} ${sanitizedNotes}`.toLowerCase();

    const scoredParts = [...availableParts]
      .map((item: any) => {
        const haystack = `${item.name || ''} ${item.category || ''} ${item.brand || ''} ${item.compatibleModels || ''} ${item.sku || ''}`.toLowerCase();
        let score = 0;
        modelTokens.forEach((tok) => {
          if (haystack.includes(tok)) score += 4;
        });
        if (symptomText.includes('spark') || symptomText.includes('smoke') || symptomText.includes('commutator') || symptomText.includes('brush')) {
          if (haystack.includes('brush') || haystack.includes('armature') || haystack.includes('stator')) score += 6;
        }
        if (symptomText.includes('switch') || symptomText.includes('power') || symptomText.includes('cable') || symptomText.includes('cord')) {
          if (haystack.includes('switch') || haystack.includes('cord') || haystack.includes('cable')) score += 6;
        }
        if (symptomText.includes('hammer') || symptomText.includes('impact') || symptomText.includes('chuck') || symptomText.includes('sds')) {
          if (haystack.includes('chuck') || haystack.includes('sds') || haystack.includes('seal') || haystack.includes('grease')) score += 6;
        }
        if (symptomText.includes('gear') || symptomText.includes('heat') || symptomText.includes('noise') || symptomText.includes('bearing')) {
          if (haystack.includes('gear') || haystack.includes('bearing') || haystack.includes('grease')) score += 6;
        }
        if (symptomText.includes('battery') || symptomText.includes('drain') || symptomText.includes('charg')) {
          if (haystack.includes('battery') || haystack.includes('charger')) score += 6;
        }
        if ((item.stockQty ?? 0) > 0) score += 1;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 75)
      .map((entry) => entry.item);

    const prompt = `You are a Senior Master Certified Power Tool Spare Parts Specialist.
Analyze the tool specifications and reported customer complaint, then select the 2 to 5 most appropriate replacement spare parts ONLY from the provided inventory catalog list.

Tool Specifications:
- Brand: ${tool.brand || 'Unknown'}
- Category: ${tool.category || 'Power Tool'}
- Model Number: ${tool.modelNumber || 'Unknown'}
- Voltage Rating: ${tool.voltageRating || 'N/A'}

Reported Complaint:
- Grievance Category: ${serviceReq.grievanceCategory || 'General Repair'}
- Detailed Complaint: "${sanitizedComplaint || 'Needs inspection'}"
- Technician Notes: "${sanitizedNotes || 'None'}"

Candidate Inventory Catalog (${scoredParts.length} items):
${JSON.stringify(
      scoredParts.map((p: any) => ({
        partId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        compatibleModels: p.compatibleModels,
        unitPrice: p.unitPrice,
        stockQty: p.stockQty,
      })),
      null,
      2
    )}

Rules:
1. Only recommend parts that appear verbatim (matching partId and sku) in the Candidate Inventory Catalog above.
2. Explain concisely why each part applies to this specific tool model and failure symptom.
3. Recommend realistic replacement quantities (usually 1, or 2 for paired bearings/brushes if applicable).`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction: 'Respond ONLY with valid structured JSON matching the declared schema. Only cite partId and sku values present in the provided catalog.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysisSummary: { type: Type.STRING },
            recommendedParts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  partId: { type: Type.STRING },
                  sku: { type: Type.STRING },
                  name: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                  confidence: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const catalogById = new Map<string, any>();
    const catalogBySku = new Map<string, any>();
    availableParts.forEach((item: any) => {
      if (item.id) catalogById.set(String(item.id), item);
      if (item.sku) catalogBySku.set(String(item.sku).toUpperCase(), item);
    });

    const seenPartIds = new Set<string>();
    const validatedParts = (Array.isArray(parsed.recommendedParts) ? parsed.recommendedParts : [])
      .map((rec: any) => {
        const matched =
          catalogById.get(String(rec.partId || '')) ||
          catalogBySku.get(String(rec.sku || '').toUpperCase());
        if (!matched || seenPartIds.has(matched.id)) return null;
        seenPartIds.add(matched.id);
        return {
          partId: matched.id,
          sku: matched.sku,
          name: matched.name,
          category: matched.category,
          compatibleModels: matched.compatibleModels,
          unitPrice: matched.unitPrice,
          stockQty: matched.stockQty,
          minStockThreshold: matched.minStockThreshold,
          binLocation: matched.binLocation,
          quantity: Math.max(1, Number(rec.quantity) || 1),
          confidence: String(rec.confidence || 'HIGH').toUpperCase() === 'MEDIUM' ? 'MEDIUM' : 'HIGH',
          reason: rec.reason || 'Recommended based on tool model and failure symptom.',
        };
      })
      .filter(Boolean);

    return res.json({
      analysisSummary:
        parsed.analysisSummary ||
        `Matched replacement parts for ${tool.brand} ${tool.modelNumber} based on "${serviceReq.grievanceCategory}".`,
      recommendedParts: validatedParts,
    });
  } catch (error: any) {
    console.error('Gemini Recommended Parts Error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI part recommendations',
      details: error.message,
    });
  }
});

// Server-side Gemini Audio Transcription Endpoint for Bench Technician Voice Notes
app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', targetField = 'notes', toolContext } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'Audio recording payload (audioBase64) is required.' });
    }

    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    if (!cleanBase64) {
      return res.status(400).json({ error: 'Recorded audio data is empty.' });
    }

    const normalizedMimeType = String(mimeType).split(';')[0].trim() || 'audio/webm';
    const targetLabel =
      targetField === 'complaint'
        ? 'Detailed Customer Complaint'
        : 'Internal Diagnostic & Repair Notes';

    const audioPart = {
      inlineData: {
        mimeType: normalizedMimeType,
        data: cleanBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: `Transcribe this spoken repair observation from a service center technician verbatim into clean, punctuated English text for "${targetLabel}" on job ticket ${toolContext?.id || ''} (${toolContext?.toolName || 'Power Tool'}). Output only the transcribed text.`,
          },
        ],
      },
    });

    const transcript = (response.text || '').trim();
    return res.json({ transcript });
  } catch (error: any) {
    console.error('Gemini Audio Transcription Error:', error);
    return res.status(500).json({
      error: 'Failed to transcribe voice note',
      details: error.message,
    });
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
