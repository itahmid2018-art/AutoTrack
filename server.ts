import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './src/lib/firebase-admin.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';
import { getEffectiveJobBilling } from './src/utils/billing.ts';

dotenv.config();

export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL?.trim() || 'gemini-4-hydrogen';
export const GEMINI_AUDIO_MODEL = process.env.GEMINI_AUDIO_MODEL?.trim() || 'gemini-3.5-transcribe';

function resolveCliArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  const prefixed = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : undefined;
}

function resolveServerPort(): number {
  const candidates = [
    resolveCliArg('--port'),
    process.env.PORT,
    process.env.DEFAULT_APP_PORT,
  ];
  for (const raw of candidates) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3000;
}

function resolveServerHost(): string {
  return resolveCliArg('--host') || process.env.HOST || '0.0.0.0';
}

const app = express();
const PORT = resolveServerPort();
const HOST = resolveServerHost();

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

// Cross-Origin Resource Sharing middleware for mobile/tablet API clients
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// In-Memory API Rate Limiter Middleware (Prevents API abuse and token exhaustion)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === '/sync/stream' || req.path === '/customer-portal/stream') {
    return next();
  }
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 300; // Workshop multi-client allowance per minute per IP

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

async function validateConfiguredGeminiModels() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const shouldValidate =
    process.env.NODE_ENV === 'production' ||
    process.env.VALIDATE_GEMINI_MODELS_ON_START === 'true';

  if (!shouldValidate || !apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return;
  }

  const configured = [
    { envKey: 'GEMINI_TEXT_MODEL', modelId: GEMINI_TEXT_MODEL },
    { envKey: 'GEMINI_AUDIO_MODEL', modelId: GEMINI_AUDIO_MODEL },
  ];

  const invalid: Array<{ envKey: string; modelId: string; error: string }> = [];

  for (const entry of configured) {
    try {
      await ai.models.get({ model: entry.modelId });
    } catch (err: any) {
      invalid.push({
        envKey: entry.envKey,
        modelId: entry.modelId,
        error: err?.message || String(err),
      });
    }
  }

  if (invalid.length > 0) {
    let alternatives: string[] = [];
    try {
      const pager = await ai.models.list();
      for await (const m of pager) {
        const clean = String(m.name || '').replace(/^models\//, '');
        if (clean) alternatives.push(clean);
        if (alternatives.length >= 12) break;
      }
    } catch {
      alternatives = [];
    }

    console.error('[startup] Invalid or inaccessible Gemini model configuration:');
    invalid.forEach((item) => {
      console.error(`  - ${item.envKey}="${item.modelId}" failed verification (${item.error})`);
    });
    if (alternatives.length > 0) {
      console.error(`  Valid models visible for this API key: ${alternatives.join(', ')}`);
    } else {
      console.error('  Run `node scripts/check_gemini_models.mjs` to inspect valid model IDs for your key.');
    }
    process.exit(1);
  }
}

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
      model: GEMINI_TEXT_MODEL,
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
- Estimate Total: $${jobCard ? getEffectiveJobBilling(jobCard as any).totalAmount.toFixed(2) : '0.00'}

Keep under 220 characters. Include clear call to action.`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
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
    const effectiveBilling = jobCard ? getEffectiveJobBilling(jobCard as any) : null;
    const totalAmount = billingSummary?.totalAmount ?? effectiveBilling?.totalAmount ?? jobCard.totalAmount ?? 0;

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
      model: GEMINI_TEXT_MODEL,
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
      model: GEMINI_TEXT_MODEL,
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
      model: GEMINI_TEXT_MODEL,
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
      model: GEMINI_TEXT_MODEL,
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
      model: GEMINI_AUDIO_MODEL,
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

// Server-side Gemini Vision Endpoint for Tool Serial Number & Barcode Extraction
app.post('/api/ai/scan-serial', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Camera image payload (imageBase64) is required.' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    if (!cleanBase64) {
      return res.status(400).json({ error: 'Captured image data is empty.' });
    }

    const normalizedMimeType = String(mimeType).split(';')[0].trim() || 'image/jpeg';

    const imagePart = {
      inlineData: {
        mimeType: normalizedMimeType,
        data: cleanBase64,
      },
    };

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: {
        parts: [
          imagePart,
          {
            text: `Inspect this power tool or spare part product QR code, barcode, or rating plate image. Extract any visible tool serial number (e.g. SN-3611B54300, 3611B54300, FD-504), spare part SKU or EAN/UPC barcode (e.g. BRSH-1002, 31651401000), tool model number (e.g. GBH 2-26 DFR), and brand (e.g. Bosch Professional). If the image contains a QR code payload or printed code, return the exact decoded string in serialNumber or sku. If nothing is readable, return empty strings.`,
          },
        ],
      },
      config: {
        systemInstruction: 'Respond ONLY with valid structured JSON matching the declared schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            serialNumber: { type: Type.STRING },
            sku: { type: Type.STRING },
            modelNumber: { type: Type.STRING },
            brand: { type: Type.STRING },
            format: { type: Type.STRING },
            confidence: { type: Type.STRING },
            notes: { type: Type.STRING },
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      serialNumber: typeof parsed.serialNumber === 'string' ? parsed.serialNumber.trim() : '',
      sku: typeof parsed.sku === 'string' ? parsed.sku.trim() : '',
      modelNumber: typeof parsed.modelNumber === 'string' ? parsed.modelNumber.trim() : '',
      brand: typeof parsed.brand === 'string' ? parsed.brand.trim() : '',
      format: typeof parsed.format === 'string' && parsed.format.trim() ? parsed.format.trim() : 'Label Vision',
      confidence: typeof parsed.confidence === 'string' ? parsed.confidence : 'MEDIUM',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    });
  } catch (error: any) {
    console.error('Gemini Serial Barcode Vision Error:', error);
    return res.status(500).json({
      error: 'Failed to decode serial number from camera image',
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

// ============================================================================
// Multi-Client Live Sync & Sanitized Customer Portal API (Firestore-Backed)
// ============================================================================

const BOOTSTRAPPED_ADMIN_EMAIL = 'gurujiytube@gmail.com';

interface SyncSubscriber {
  res: express.Response;
  uid: string;
  email?: string;
}

const syncSubscribers = new Set<SyncSubscriber>();
const deliverySubscribers = new Map<string, Set<express.Response>>();

function sanitizeDocId(raw: string, fallback = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
  return cleaned || fallback;
}

function serializeFirestoreDoc(data: Record<string, any> | undefined): Record<string, any> | null {
  if (!data) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) {
      out[k] = v.toDate().toISOString();
    } else if (v && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  if (typeof out.createdAtIso === 'string' && out.createdAtIso) {
    out.createdAt = out.createdAtIso;
  }
  if (typeof out.updatedAtIso === 'string' && out.updatedAtIso) {
    out.updatedAt = out.updatedAtIso;
  }
  return out;
}

function broadcastSyncEvent(eventName: string, payload: unknown) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of syncSubscribers) {
    try {
      client.res.write(frame);
    } catch {
      syncSubscribers.delete(client);
    }
  }
}

function buildSanitizedPublicSummary(
  job: Record<string, any>,
  verifiedByTokenOrPhone: boolean
) {
  const digits = String(job.customerPhone || '').replace(/\D/g, '');
  const phoneLast4 = digits.slice(-4);
  const maskedPhone = phoneLast4 ? `•••-•••-${phoneLast4}` : 'On file';
  const serial = String(job.tool?.serialNumber || 'N/A');
  const toolSerialMasked =
    serial.length > 5 && !verifiedByTokenOrPhone
      ? `${serial.slice(0, 3)}••••${serial.slice(-3)}`
      : serial;
  const warrantyFlag =
    job.tool?.warrantyFlag ||
    job.tool?.warrantyAdjudication?.flag ||
    (job.tool?.warrantyStatus === 'Out of Warranty' ? 'Out-of-Warranty' : 'In-Warranty');

  const sanitizedFeedback =
    job.customerFeedback && typeof job.customerFeedback.rating === 'number'
      ? {
          rating: Number(job.customerFeedback.rating),
          comment: String(job.customerFeedback.comment || ''),
          submittedAt: String(job.customerFeedback.submittedAt || ''),
          channel: job.customerFeedback.channel === 'Portal' ? 'Portal' : 'SMS',
        }
      : undefined;

  return {
    id: String(job.id || ''),
    customerFirstName: String(job.customerName || 'Client').split(' ')[0],
    maskedPhone,
    phoneLast4,
    hasCompany: Boolean(job.customerCompany),
    customerCompany: verifiedByTokenOrPhone ? job.customerCompany : undefined,
    toolBrand: String(job.tool?.brand || 'Bosch Professional'),
    toolCategory: String(job.tool?.category || 'Power Tool'),
    toolModel: String(job.tool?.modelNumber || ''),
    toolSerialMasked,
    voltageRating: String(job.tool?.voltageRating || ''),
    warrantyFlag,
    warrantyStatusLabel: String(job.tool?.warrantyStatus || 'Unconfirmed'),
    accessoriesReceived: Array.isArray(job.tool?.accessoriesReceived)
      ? job.tool.accessoriesReceived
      : [],
    grievanceCategory: String(job.serviceReq?.grievanceCategory || ''),
    intakeDate: String(job.intakeDate || ''),
    promisedCompletion: String(job.promisedCompletion || ''),
    status: String(job.status || 'Intake'),
    priority: String(job.priority || 'Routine'),
    estimatedTotal: getEffectiveJobBilling(job as any).totalAmount,
    partsCount: Array.isArray(job.parts) ? job.parts.length : 0,
    stageHistory: Array.isArray(job.stageHistory)
      ? job.stageHistory
      : [{ status: String(job.status || 'Intake'), enteredAt: String(job.intakeDate || '') }],
    updatedAt: String(job.updatedAtIso || job.updatedAt || new Date().toISOString()),
    verifiedByTokenOrPhone,
    publicAccessToken: verifiedByTokenOrPhone ? String(job.publicAccessToken || '') : undefined,
    readyForDelivery: job.status === 'Ready for Pickup' || job.status === 'Completed',
    ...(sanitizedFeedback ? { customerFeedback: sanitizedFeedback } : {}),
  };
}

function broadcastDeliveryUpdate(job: Record<string, any>) {
  const summary = buildSanitizedPublicSummary(job, true);
  const frame = `event: delivery:updated\ndata: ${JSON.stringify(summary)}\n\n`;
  const keys = [
    String(job.publicAccessToken || '').toLowerCase(),
    String(job.id || '').toLowerCase(),
  ].filter(Boolean);

  for (const key of keys) {
    const subscribers = deliverySubscribers.get(key);
    if (!subscribers) continue;
    for (const res of subscribers) {
      try {
        res.write(frame);
      } catch {
        subscribers.delete(res);
      }
    }
  }
}

async function isRequestAdmin(req: AuthRequest): Promise<boolean> {
  if (!req.user) return false;
  if (
    req.user.email_verified === true &&
    req.user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  ) {
    return true;
  }
  try {
    const adminDoc = await adminDb.collection('admins').doc(req.user.uid).get();
    return adminDoc.exists;
  } catch {
    return false;
  }
}

function canAccessMemberDoc(data: Record<string, any> | undefined, req: AuthRequest, isAdmin: boolean): boolean {
  if (!data || !req.user) return false;
  if (isAdmin) return true;
  const staffUids = Array.isArray(data.staffUids) ? data.staffUids : [];
  return data.ownerUid === req.user.uid || staffUids.includes(req.user.uid);
}

// Live authenticated SSE stream for Android / tablet / secondary web clients
app.get('/api/sync/stream', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split('Bearer ')[1]
        : queryToken;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const subscriber: SyncSubscriber = {
      res,
      uid: decoded.uid,
      email: decoded.email,
    };
    syncSubscribers.add(subscriber);

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, uid: decoded.uid })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        syncSubscribers.delete(subscriber);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      syncSubscribers.delete(subscriber);
    });
  } catch (error: any) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token', details: error?.message });
  }
});

// Multi-client Job Cards API
app.get('/api/jobs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = await isRequestAdmin(req);
    const snap = admin
      ? await adminDb.collection('jobCards').get()
      : await adminDb
          .collection('jobCards')
          .where('staffUids', 'array-contains', req.user!.uid)
          .get();

    const jobs = snap.docs
      .map((d) => serializeFirestoreDoc(d.data()))
      .filter(Boolean);
    return res.json({ jobs });
  } catch (error: any) {
    console.error('GET /api/jobs error:', error);
    return res.status(500).json({ error: 'Failed to load job cards', details: error.message });
  }
});

app.post('/api/jobs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const job = req.body;
    if (!job || !job.id || !job.customerName) {
      return res.status(400).json({ error: 'Job id and customerName are required.' });
    }
    const jobId = sanitizeDocId(job.id);
    const uid = req.user!.uid;
    const generatedFallbackToken = `tok-${jobId.toLowerCase().slice(0, 48)}-${crypto.randomBytes(6).toString('hex')}`;
    const token = sanitizeDocId(
      job.publicAccessToken || generatedFallbackToken,
      generatedFallbackToken
    );
    const staffUids = Array.from(
      new Set([uid, ...(Array.isArray(job.staffUids) ? job.staffUids : [])])
    ).slice(0, 20);
    const nowIso = new Date().toISOString();

    const docPayload = {
      ...job,
      id: jobId,
      ownerUid: uid,
      staffUids,
      publicAccessToken: token,
      createdAtIso: job.createdAt || nowIso,
      updatedAtIso: nowIso,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection('jobCards').doc(jobId).set(docPayload);
    await adminDb
      .collection('publicDeliveries')
      .doc(token)
      .set({
        token,
        ownerUid: uid,
        staffUids,
        jobId,
        status: String(job.status || 'Intake'),
        toolBrand: String(job.tool?.brand || 'Bosch Professional'),
        toolModel: String(job.tool?.modelNumber || 'Power Tool'),
        warrantyFlag: String(
          job.tool?.warrantyFlag || job.tool?.warrantyAdjudication?.flag || 'In-Warranty'
        ),
        intakeDate: String(job.intakeDate || nowIso.slice(0, 16).replace('T', ' ')),
        promisedCompletion: String(
          job.promisedCompletion || nowIso.slice(0, 16).replace('T', ' ')
        ),
        totalAmount: Number(job.totalAmount || 0),
        readyForDelivery: job.status === 'Ready for Pickup' || job.status === 'Completed',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    const saved = { ...job, id: jobId, publicAccessToken: token, createdAt: nowIso, updatedAt: nowIso };
    broadcastSyncEvent('job:updated', saved);
    broadcastDeliveryUpdate(saved);
    return res.status(201).json({ job: saved });
  } catch (error: any) {
    console.error('POST /api/jobs error:', error);
    return res.status(500).json({ error: 'Failed to create job card', details: error.message });
  }
});

app.put('/api/jobs/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const jobId = sanitizeDocId(req.params.id);
    const ref = adminDb.collection('jobCards').doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Job card not found.' });
    }
    const existing = snap.data()!;
    const admin = await isRequestAdmin(req);
    if (!canAccessMemberDoc(existing, req, admin)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if ((existing.status === 'Completed' || existing.status === 'Cancelled') && !admin) {
      return res.status(403).json({ error: 'Completed or cancelled job cards require admin privileges to edit.' });
    }

    const nowIso = new Date().toISOString();
    const updates = { ...req.body };
    delete updates.id;
    delete updates.ownerUid;
    delete updates.createdAt;
    delete updates.createdAtIso;

    await ref.update({
      ...updates,
      updatedAtIso: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const merged = {
      ...serializeFirestoreDoc(existing),
      ...updates,
      id: jobId,
      updatedAt: nowIso,
    };

    const token = sanitizeDocId(
      merged.publicAccessToken || `tok-${jobId.toLowerCase()}`,
      `tok-${jobId.toLowerCase()}`
    );
    await adminDb
      .collection('publicDeliveries')
      .doc(token)
      .set(
        {
          token,
          ownerUid: String(existing.ownerUid || req.user!.uid),
          staffUids: Array.isArray(existing.staffUids) ? existing.staffUids : [req.user!.uid],
          jobId,
          status: String(merged.status || 'Intake'),
          toolBrand: String(merged.tool?.brand || 'Bosch Professional'),
          toolModel: String(merged.tool?.modelNumber || 'Power Tool'),
          warrantyFlag: String(
            merged.tool?.warrantyFlag || merged.tool?.warrantyAdjudication?.flag || 'In-Warranty'
          ),
          intakeDate: String(merged.intakeDate || nowIso.slice(0, 16).replace('T', ' ')),
          promisedCompletion: String(
            merged.promisedCompletion || nowIso.slice(0, 16).replace('T', ' ')
          ),
          totalAmount: Number(merged.totalAmount || 0),
          readyForDelivery: merged.status === 'Ready for Pickup' || merged.status === 'Completed',
          createdAt: existing.createdAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    broadcastSyncEvent('job:updated', merged);
    broadcastDeliveryUpdate(merged);
    return res.json({ job: merged });
  } catch (error: any) {
    console.error('PUT /api/jobs/:id error:', error);
    return res.status(500).json({ error: 'Failed to update job card', details: error.message });
  }
});

// Multi-client Inventory API
app.get('/api/inventory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = await isRequestAdmin(req);
    const snap = admin
      ? await adminDb.collection('inventory').get()
      : await adminDb
          .collection('inventory')
          .where('staffUids', 'array-contains', req.user!.uid)
          .get();

    const items = snap.docs.map((d) => serializeFirestoreDoc(d.data())).filter(Boolean);
    return res.json({ items });
  } catch (error: any) {
    console.error('GET /api/inventory error:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory', details: error.message });
  }
});

app.post('/api/inventory', requireAuth, async (req: AuthRequest, res) => {
  try {
    const item = req.body;
    if (!item || !item.id || !item.sku) {
      return res.status(400).json({ error: 'Inventory id and sku are required.' });
    }
    const itemId = sanitizeDocId(item.id);
    const uid = req.user!.uid;
    const ref = adminDb.collection('inventory').doc(itemId);
    const existing = await ref.get();
    const staffUids = Array.from(
      new Set([
        uid,
        ...(Array.isArray(existing.data()?.staffUids) ? existing.data()!.staffUids : []),
      ])
    ).slice(0, 20);

    await ref.set({
      ...item,
      id: itemId,
      ownerUid: existing.exists ? existing.data()!.ownerUid : uid,
      staffUids,
      createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    broadcastSyncEvent('inventory:updated', { ...item, id: itemId });
    return res.status(201).json({ item: { ...item, id: itemId } });
  } catch (error: any) {
    console.error('POST /api/inventory error:', error);
    return res.status(500).json({ error: 'Failed to save inventory item', details: error.message });
  }
});

app.patch('/api/inventory/:id/stock', requireAuth, async (req: AuthRequest, res) => {
  try {
    const itemId = sanitizeDocId(req.params.id);
    const ref = adminDb.collection('inventory').doc(itemId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }
    const existing = snap.data()!;
    const admin = await isRequestAdmin(req);
    if (!canAccessMemberDoc(existing, req, admin)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { stockQty, delta } = req.body || {};
    const currentQty = Number(existing.stockQty || 0);
    const nextQty =
      typeof stockQty === 'number'
        ? Math.max(0, stockQty)
        : Math.max(0, currentQty + Number(delta || 0));
    const today = new Date().toISOString().split('T')[0];

    await ref.update({
      stockQty: nextQty,
      lastRestocked: Number(delta || 0) > 0 ? today : existing.lastRestocked || today,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updatedItem = { ...serializeFirestoreDoc(existing), id: itemId, stockQty: nextQty };
    broadcastSyncEvent('inventory:updated', updatedItem);
    return res.json({ item: updatedItem });
  } catch (error: any) {
    console.error('PATCH /api/inventory/:id/stock error:', error);
    return res.status(500).json({ error: 'Failed to update stock', details: error.message });
  }
});

// Multi-client Recurring Maintenance Schedules API
app.get('/api/schedules', requireAuth, async (req: AuthRequest, res) => {
  try {
    const admin = await isRequestAdmin(req);
    const snap = admin
      ? await adminDb.collection('schedules').get()
      : await adminDb
          .collection('schedules')
          .where('staffUids', 'array-contains', req.user!.uid)
          .get();

    const schedules = snap.docs.map((d) => serializeFirestoreDoc(d.data())).filter(Boolean);
    return res.json({ schedules });
  } catch (error: any) {
    console.error('GET /api/schedules error:', error);
    return res.status(500).json({ error: 'Failed to fetch schedules', details: error.message });
  }
});

app.post('/api/schedules', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schedule = req.body;
    if (!schedule || !schedule.id || !schedule.customerName) {
      return res.status(400).json({ error: 'Schedule id and customerName are required.' });
    }
    const schedId = sanitizeDocId(schedule.id);
    const uid = req.user!.uid;
    const nowIso = new Date().toISOString();
    const ref = adminDb.collection('schedules').doc(schedId);
    const existing = await ref.get();
    const admin = await isRequestAdmin(req);

    if (existing.exists && existing.data()?.status === 'Serviced' && !admin) {
      return res.status(403).json({ error: 'Serviced schedules require admin privileges to modify.' });
    }

    const staffUids = Array.from(
      new Set([
        uid,
        ...(Array.isArray(existing.data()?.staffUids) ? existing.data()!.staffUids : []),
      ])
    ).slice(0, 20);

    await ref.set({
      ...schedule,
      id: schedId,
      ownerUid: existing.exists ? existing.data()!.ownerUid : uid,
      staffUids,
      createdAtIso: schedule.createdAt || existing.data()?.createdAtIso || nowIso,
      updatedAtIso: nowIso,
      createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const saved = { ...schedule, id: schedId, updatedAt: nowIso };
    broadcastSyncEvent('schedule:updated', saved);
    return res.status(201).json({ schedule: saved });
  } catch (error: any) {
    console.error('POST /api/schedules error:', error);
    return res.status(500).json({ error: 'Failed to save schedule', details: error.message });
  }
});

// Sanitized Public Customer Portal Lookup (Zero PII Leakage)
app.get('/api/customer-portal/lookup', async (req, res) => {
  try {
    const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    const phoneLast4 = typeof req.query.phoneLast4 === 'string' ? req.query.phoneLast4.replace(/\D/g, '').slice(-4) : '';

    if (!rawQuery) {
      return res.status(400).json({ error: 'Query (Job ID or access token) is required.' });
    }

    const cleanId = sanitizeDocId(rawQuery);
    // 1. Check direct publicDelivery token
    const tokenSnap = await adminDb.collection('publicDeliveries').doc(cleanId).get();
    if (tokenSnap.exists) {
      const pub = tokenSnap.data()!;
      const jobSnap = pub.jobId ? await adminDb.collection('jobCards').doc(String(pub.jobId)).get() : null;
      if (jobSnap?.exists) {
        return res.json({ summary: buildSanitizedPublicSummary(jobSnap.data()!, true) });
      }
      return res.json({
        summary: {
          id: String(pub.jobId || cleanId),
          customerFirstName: 'Client',
          maskedPhone: 'On file',
          phoneLast4: '',
          hasCompany: false,
          toolBrand: String(pub.toolBrand || 'Bosch Professional'),
          toolCategory: 'Power Tool',
          toolModel: String(pub.toolModel || ''),
          toolSerialMasked: 'Verified Token',
          voltageRating: '',
          warrantyFlag: pub.warrantyFlag === 'Out-of-Warranty' ? 'Out-of-Warranty' : 'In-Warranty',
          warrantyStatusLabel: String(pub.warrantyFlag || 'Verified'),
          accessoriesReceived: [],
          grievanceCategory: 'Service Ticket',
          intakeDate: String(pub.intakeDate || ''),
          promisedCompletion: String(pub.promisedCompletion || ''),
          status: String(pub.status || 'Intake'),
          priority: 'Routine',
          estimatedTotal: Number(pub.totalAmount || 0),
          partsCount: 0,
          stageHistory: [{ status: String(pub.status || 'Intake'), enteredAt: String(pub.intakeDate || '') }],
          updatedAt: pub.updatedAt instanceof Timestamp ? pub.updatedAt.toDate().toISOString() : new Date().toISOString(),
          verifiedByTokenOrPhone: true,
          publicAccessToken: cleanId,
          readyForDelivery: Boolean(pub.readyForDelivery),
          ...(pub.feedbackSubmitted && typeof pub.feedbackRating === 'number'
            ? {
                customerFeedback: {
                  rating: Number(pub.feedbackRating),
                  comment: String(pub.feedbackComment || ''),
                  submittedAt: String(pub.feedbackSubmittedAt || ''),
                  channel: 'SMS',
                },
              }
            : {}),
        },
      });
    }

    // 2. Check jobCards by publicAccessToken
    const tokenQuery = await adminDb
      .collection('jobCards')
      .where('publicAccessToken', '==', rawQuery)
      .limit(1)
      .get();
    if (!tokenQuery.empty) {
      return res.json({
        summary: buildSanitizedPublicSummary(tokenQuery.docs[0].data(), true),
      });
    }

    // 3. Check jobCards by Job ID (exact case or uppercase match)
    let jobSnap = await adminDb.collection('jobCards').doc(cleanId).get();
    if (!jobSnap.exists && cleanId.toUpperCase() !== cleanId) {
      jobSnap = await adminDb.collection('jobCards').doc(cleanId.toUpperCase()).get();
    }
    if (!jobSnap.exists) {
      return res.status(404).json({ error: 'No matching service ticket found.' });
    }

    const jobData = jobSnap.data()!;
    const jobPhoneLast4 = String(jobData.customerPhone || '').replace(/\D/g, '').slice(-4);
    if (!phoneLast4) {
      return res.status(403).json({
        error: 'Phone verification (last 4 digits) is required to view a ticket by Job ID.',
        requiresPhoneVerification: true,
        jobId: String(jobData.id || cleanId),
      });
    }
    if (phoneLast4 !== jobPhoneLast4) {
      return res.status(403).json({
        error: 'Verification digits do not match ticket.',
        requiresPhoneVerification: true,
        invalidPhone: true,
        jobId: String(jobData.id || cleanId),
      });
    }
    return res.json({ summary: buildSanitizedPublicSummary(jobData, true) });
  } catch (error: any) {
    console.error('Customer portal lookup error:', error);
    return res.status(503).json({
      error: 'Customer portal remote lookup unavailable.',
      details: error?.message,
    });
  }
});

// Public Customer Feedback Submission (persists rating & comment onto jobCards & publicDeliveries)
app.post('/api/customer-portal/feedback', async (req, res) => {
  try {
    const rawQuery = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const rawRating = Number(req.body?.rating);
    const rawComment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    const phoneLast4 = typeof req.body?.phoneLast4 === 'string'
      ? req.body.phoneLast4.replace(/\D/g, '').slice(-4)
      : '';
    const channel = req.body?.channel === 'Portal' ? 'Portal' : 'SMS';

    if (!rawQuery) {
      return res.status(400).json({ error: 'Job ID or public access token is required.' });
    }
    if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
    }
    if (rawComment.length > 1000) {
      return res.status(400).json({ error: 'Feedback comment must be 1000 characters or fewer.' });
    }

    const cleanId = sanitizeDocId(rawQuery);
    let targetJobSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    let verifiedByToken = false;

    const tokenDocSnap = await adminDb.collection('publicDeliveries').doc(cleanId).get();
    if (tokenDocSnap.exists) {
      const pub = tokenDocSnap.data()!;
      if (pub.jobId) {
        const linkedJob = await adminDb.collection('jobCards').doc(String(pub.jobId)).get();
        if (linkedJob.exists) {
          targetJobSnap = linkedJob;
          verifiedByToken = true;
        }
      }
    }

    if (!targetJobSnap) {
      const byAccessToken = await adminDb
        .collection('jobCards')
        .where('publicAccessToken', '==', rawQuery)
        .limit(1)
        .get();
      if (!byAccessToken.empty) {
        targetJobSnap = byAccessToken.docs[0];
        verifiedByToken = true;
      }
    }

    if (!targetJobSnap) {
      let byId = await adminDb.collection('jobCards').doc(cleanId).get();
      if (!byId.exists && cleanId.toUpperCase() !== cleanId) {
        byId = await adminDb.collection('jobCards').doc(cleanId.toUpperCase()).get();
      }
      if (byId.exists) {
        targetJobSnap = byId;
      }
    }

    const nowIso = new Date().toISOString();

    if (!targetJobSnap || !targetJobSnap.exists) {
      // Allow client local/offline store to persist when job exists only in local session cache
      if (tokenDocSnap.exists) {
        const pub = tokenDocSnap.data()!;
        await adminDb.collection('publicDeliveries').doc(cleanId).set(
          {
            feedbackSubmitted: true,
            feedbackRating: rawRating,
            feedbackComment: rawComment,
            feedbackSubmittedAt: nowIso,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return res.json({
          success: true,
          persistedToCloud: true,
          feedback: {
            rating: rawRating,
            comment: rawComment,
            submittedAt: nowIso,
            channel,
          },
        });
      }

      return res.status(404).json({
        success: false,
        persistedToCloud: false,
        localFallbackAllowed: true,
        error: 'Job record not found in cloud database.',
      });
    }

    const existingJob = targetJobSnap.data()!;
    const jobPhoneLast4 = String(existingJob.customerPhone || '').replace(/\D/g, '').slice(-4);
    if (!verifiedByToken) {
      if (!phoneLast4) {
        return res.status(403).json({
          success: false,
          error: 'Phone verification (last 4 digits) is required when submitting feedback by Job ID.',
          requiresPhoneVerification: true,
        });
      }
      if (jobPhoneLast4 && phoneLast4 !== jobPhoneLast4) {
        return res.status(403).json({
          success: false,
          error: 'Phone last 4 digits do not match the service ticket.',
          invalidPhone: true,
        });
      }
    }

    const feedbackPayload: Record<string, unknown> = {
      rating: rawRating,
      comment: rawComment,
      submittedAt: nowIso,
      channel,
      customerName: String(existingJob.customerName || 'Client').split(' ')[0].slice(0, 160),
    };
    if (existingJob.feedbackSmsSentAt) {
      feedbackPayload.smsSentAt = String(existingJob.feedbackSmsSentAt).slice(0, 40);
      feedbackPayload.smsStatus = 'Sent';
    }

    const existingAuditLogs = Array.isArray(existingJob.auditLogs) ? existingJob.auditLogs : [];
    const nextAuditLogs = [
      ...existingAuditLogs,
      {
        id: `aud-fb-${Date.now()}`,
        timestamp: nowIso.slice(0, 16).replace('T', ' '),
        userName: String(existingJob.customerName || 'Client').split(' ')[0],
        userRole: 'Client',
        action: 'CUSTOMER_FEEDBACK_SUBMITTED',
        newState: `Rating: ${rawRating}/5 stars${rawComment ? ` — "${rawComment.slice(0, 80)}"` : ''}`,
      },
    ].slice(-50);

    await targetJobSnap.ref.update({
      customerFeedback: feedbackPayload,
      auditLogs: nextAuditLogs,
      updatedAtIso: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const token = sanitizeDocId(
      String(existingJob.publicAccessToken || `tok-${sanitizeDocId(existingJob.id || targetJobSnap.id).toLowerCase()}`),
      `tok-${sanitizeDocId(targetJobSnap.id).toLowerCase()}`
    );
    await adminDb
      .collection('publicDeliveries')
      .doc(token)
      .set(
        {
          feedbackSubmitted: true,
          feedbackRating: rawRating,
          feedbackComment: rawComment,
          feedbackSubmittedAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    const merged = {
      ...serializeFirestoreDoc(existingJob),
      id: targetJobSnap.id,
      customerFeedback: feedbackPayload,
      auditLogs: nextAuditLogs,
      updatedAt: nowIso,
    };

    broadcastSyncEvent('job:updated', merged);
    broadcastDeliveryUpdate(merged);

    return res.json({
      success: true,
      persistedToCloud: true,
      feedback: feedbackPayload,
      summary: buildSanitizedPublicSummary(merged, true),
    });
  } catch (error: any) {
    console.error('Customer feedback submission error:', error);
    return res.status(503).json({
      success: false,
      persistedToCloud: false,
      localFallbackAllowed: true,
      error: 'Cloud feedback persistence unavailable.',
      details: error?.message,
    });
  }
});

// Live Sanitized Customer Delivery SSE Stream
app.get('/api/customer-portal/stream', (req, res) => {
  const tokenKey = typeof req.query.token === 'string' ? req.query.token.trim().toLowerCase() : '';
  const jobKey = typeof req.query.jobId === 'string' ? req.query.jobId.trim().toLowerCase() : '';
  const keys = [tokenKey, jobKey].filter(Boolean);

  if (keys.length === 0) {
    return res.status(400).json({ error: 'token or jobId query param required.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const key of keys) {
    if (!deliverySubscribers.has(key)) {
      deliverySubscribers.set(key, new Set());
    }
    deliverySubscribers.get(key)!.add(res);
  }

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: keepalive ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    for (const key of keys) {
      const set = deliverySubscribers.get(key);
      if (set) {
        set.delete(res);
        if (set.size === 0) deliverySubscribers.delete(key);
      }
    }
  });
});

function resolveStaticDistDir(): string {
  const candidates: string[] = [];
  if (typeof __dirname !== 'undefined') {
    candidates.push(path.resolve(__dirname, '..', 'dist'));
    candidates.push(path.resolve(__dirname, 'dist'));
  }
  candidates.push(path.resolve(process.cwd(), 'dist'));
  return (
    candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html'))) ||
    candidates[0]
  );
}

async function startServer() {
  await validateConfiguredGeminiModels();

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = resolveStaticDistDir();
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      console.warn(`[startup] Static frontend bundle not found at ${distDir}. Run "npm run build" first.`);
    }
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      const indexPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return res.status(404).send('Frontend build not found. Run npm run build.');
      }
      return res.sendFile(indexPath);
    });
  }

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Server failed to bind ${HOST}:${PORT}:`, err.message);
    process.exit(1);
  });

  httpServer.listen(PORT, HOST, () => {
    const mode = process.env.NODE_ENV || 'development';
    console.log(`BOSCH Service Center Server (${mode}) running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
