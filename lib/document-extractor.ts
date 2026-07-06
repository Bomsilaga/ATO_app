import Anthropic from "@anthropic-ai/sdk";
import { ExtractedFields } from "./types";

// Last-resort extraction for files the deterministic parsers can't handle:
// scanned/signed/image-only PDFs (pdf-parse finds no text) and photographed
// receipts. Sends the file straight to Claude as a document/image block
// instead of trying to OCR it ourselves.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-5";

const PROMPT = `You are extracting financial transaction line items from a document (a receipt,
invoice, bank/crypto statement, or tax return) for an Australian tax return preparation tool.

List every distinct financial line item you can find: amount (AUD number, no symbols), date (ISO
yyyy-mm-dd) if present, and a short description. If there are no extractable financial line items,
return an empty array — don't invent one.

Return ONLY JSON, no markdown fences, no preamble:
{"lines": [{"amount": number|null, "date": string|null, "description": string}]}`;

export async function extractLinesFromDocument(
  buffer: Buffer,
  mediaType: string
): Promise<ExtractedFields[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const isPdf = mediaType === "application/pdf";
  const block = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: mediaType, data: buffer.toString("base64") }
      }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: mediaType as any, data: buffer.toString("base64") }
      };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] as any }]
    });

    const text = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];

    return lines.map((l: any) => ({
      amount: typeof l.amount === "number" ? l.amount : undefined,
      date: l.date ?? undefined,
      description: l.description || "Extracted from document"
    }));
  } catch {
    return [];
  }
}
