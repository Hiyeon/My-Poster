/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const GENRES = ['Teen', 'Action', 'Thriller', 'Romance', 'Fantasy', 'Academy'];

// --- Helper Functions ---

/**
 * Creates a fallback prompt to use when the primary one is blocked.
 * @param genre The movie genre string (e.g., "Action").
 * @returns The fallback prompt string.
 */
function getFallbackPrompt(genre: string): string {
    return `The user's original prompt was blocked. As a fallback, create a movie poster using the provided image. The image is already in a 2:3 aspect ratio. Transform the entire scene into a cohesive movie poster in the style of a ${genre.toLowerCase()} film. Creatively integrate all elements, including any black padded areas, into the new scene.`;
}

/**
 * Extracts the genre (e.g., "Action") from a prompt string.
 * @param prompt The original prompt.
 * @returns The genre string or null if not found.
 */
function extractGenre(prompt: string): string | null {
    const lowerCasePrompt = prompt.toLowerCase();
    for (const genre of GENRES) {
        if (lowerCasePrompt.includes(genre.toLowerCase())) {
            return genre;
        }
    }
    return null;
}

/**
 * Processes the Gemini API response, extracting the image or throwing a detailed error if none is found.
 * @param response The response from the generateContent call.
 * @returns A data URL string for the generated image.
 */
function processGeminiResponse(response: GenerateContentResponse): string {
    const candidate = response.candidates?.[0];

    // Check for safety blocks or other non-STOP finish reasons first
    if (!candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
        const blockReason = response.promptFeedback?.blockReason;
        const finishReason = candidate?.finishReason;
        const safetyRatings = JSON.stringify(candidate?.safetyRatings, null, 2);
        
        let errorMessage = `Image generation failed.`;
        if (blockReason) {
            errorMessage += ` Block Reason: ${blockReason}.`;
        }
        if (finishReason) {
            errorMessage += ` Finish Reason: ${finishReason}.`;
        }
        if (candidate?.safetyRatings) {
            errorMessage += ` Safety Ratings: ${safetyRatings}.`;
        }
        console.error("Full API Response:", JSON.stringify(response, null, 2));
        throw new Error(errorMessage);
    }

    const imagePartFromResponse = candidate.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        return `data:${mimeType};base64,${data}`;
    }

    // This case handles when the model successfully returns (STOP), but without an image part.
    const textResponse = response.text;
    console.error("API did not return an image despite a successful response. Response Text:", textResponse);
    throw new Error(`The AI model responded with text instead of an image: "${textResponse || 'No text response received.'}"`);
}


/**
 * A wrapper for the Gemini API call that includes a retry mechanism for internal server errors.
 * @param imagePart The image part of the request payload.
 * @param textPart The text part of the request payload.
 * @returns The GenerateContentResponse from the API.
 */
async function callGeminiWithRetry(imagePart: object, textPart: object): Promise<GenerateContentResponse> {
    const maxRetries = 3;
    const initialDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [imagePart, textPart] },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });
        } catch (error) {
            console.error(`Error calling Gemini API (Attempt ${attempt}/${maxRetries}):`, error);
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            const isInternalError = errorMessage.includes('"code":500') || errorMessage.includes('INTERNAL');

            if (isInternalError && attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.log(`Internal error detected. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error; // Re-throw if not a retriable error or if max retries are reached.
        }
    }
    // This should be unreachable due to the loop and throw logic above.
    throw new Error("Gemini API call failed after all retries.");
}


/**
 * Generates a genre-styled movie poster from a source image and a prompt.
 * It includes a fallback mechanism for prompts that might be blocked.
 * @param imageDataUrl A data URL string of the source image (e.g., 'data:image/png;base64,...').
 * @param prompt The prompt to guide the image generation.
 * @returns A promise that resolves to a base64-encoded image data URL of the generated image.
 */
export async function generatePosterImage(imageDataUrl: string, prompt: string): Promise<string> {
  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid image data URL format. Expected 'data:image/...;base64,...'");
  }
  const [, mimeType, base64Data] = match;

    const imagePart = {
        inlineData: { mimeType, data: base64Data },
    };

    // --- First attempt with the original prompt ---
    try {
        console.log("Attempting generation with original prompt...");
        const textPart = { text: prompt };
        const response = await callGeminiWithRetry(imagePart, textPart);
        return processGeminiResponse(response);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        
        // Check for specific failure reasons that warrant a fallback
        const isLikelyBlocked = errorMessage.includes("Finish Reason: SAFETY") || errorMessage.includes("Block Reason:") || errorMessage.includes("PROHIBITED_CONTENT");
        const isNoImageError = errorMessage.includes("The AI model responded with text instead of an image");

        if (isLikelyBlocked || isNoImageError) {
            console.warn("Original prompt failed or was blocked. Trying a fallback prompt. Reason:", errorMessage);
            const genre = extractGenre(prompt);
            if (!genre) {
                console.error("Could not extract genre from prompt, cannot use fallback.");
                throw error; // Re-throw the original error.
            }

            // --- Second attempt with the fallback prompt ---
            try {
                const fallbackPrompt = getFallbackPrompt(genre);
                console.log(`Attempting generation with fallback prompt for ${genre}...`);
                const fallbackTextPart = { text: fallbackPrompt };
                const fallbackResponse = await callGeminiWithRetry(imagePart, fallbackTextPart);
                return processGeminiResponse(fallbackResponse);
            } catch (fallbackError) {
                console.error("Fallback prompt also failed.", fallbackError);
                const finalErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                throw new Error(`The AI model failed with both original and fallback prompts. Last error: ${finalErrorMessage}`);
            }
        } else {
            // This is for other errors, like a final internal server error after retries.
            console.error("An unrecoverable error occurred during image generation.", error);
            throw new Error(`The AI model failed to generate an image. Details: ${errorMessage}`);
        }
    }
}