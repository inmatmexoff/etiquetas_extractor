'use server';
/**
 * @fileOverview A flow to extract structured data from a purchase order PDF.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractPurchaseOrderInputSchema = z.object({
  pdfDataUri: z
    .string()
    .describe(
      "A PDF file encoded as a data URI. Must include a MIME type and use Base64 encoding. Expected format: 'data:application/pdf;base64,<encoded_data>'."
    ),
});
export type ExtractPurchaseOrderInput = z.infer<typeof ExtractPurchaseOrderInputSchema>;

const LineItemSchema = z.object({
    productName: z.string().describe("The name of the product or item."),
    quantity: z.number().describe("The quantity of the item."),
});

const PurchaseOrderSchema = z.object({
  buyerName: z.string().describe("The full name of the person or company buying the goods."),
  date: z.string().describe("The date of the purchase order."),
  lineItems: z.array(LineItemSchema).describe("An array of all the products or services listed in the purchase order."),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;


const prompt = ai.definePrompt({
  name: 'extractPurchaseOrderPrompt',
  input: {schema: ExtractPurchaseOrderInputSchema},
  output: {schema: PurchaseOrderSchema},
  prompt: `You are an expert at processing invoices and purchase orders. Your task is to extract structured information from the provided PDF document.

Analyze the document and extract the buyer's name, the date of the order, and all line items, including the product name and quantity for each.

Return the data in the specified JSON format.

Document: {{media url=pdfDataUri}}`,
});

const extractPurchaseOrderFlow = ai.defineFlow(
  {
    name: 'extractPurchaseOrderFlow',
    inputSchema: ExtractPurchaseOrderInputSchema,
    outputSchema: PurchaseOrderSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) {
        throw new Error("Unable to extract data from the document. The model did not return any output.");
    }
    return output;
  }
);

export async function extractPurchaseOrder(input: ExtractPurchaseOrderInput): Promise<PurchaseOrder> {
    const result = await extractPurchaseOrderFlow(input);
    if(!result) {
        throw new Error("Flow returned no result");
    }
    return result;
}
