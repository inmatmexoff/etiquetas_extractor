'use server';
/**
 * @fileOverview A flow to extract text from an image.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractTextInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "An image of a document snippet, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractTextInput = z.infer<typeof ExtractTextInputSchema>;

const prompt = ai.definePrompt({
  name: 'extractTextPrompt',
  input: {schema: ExtractTextInputSchema},
  output: {schema: z.string().describe('The extracted text from the image.')},
  prompt: `Extract the text from the following image. Only return the text content, without any additional explanation or formatting.

Image: {{media url=photoDataUri}}`,
});

const extractTextFlow = ai.defineFlow(
  {
    name: 'extractTextFlow',
    inputSchema: ExtractTextInputSchema,
    outputSchema: z.string(),
  },
  async (input) => {
    const {output} = await prompt(input);
    // The output of the prompt is already a string because of the output schema we defined.
    // If output is null or undefined, return an empty string.
    return output ?? '';
  }
);

export async function extractText(input: ExtractTextInput): Promise<string> {
    return extractTextFlow(input);
}
