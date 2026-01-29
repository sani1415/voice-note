
import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = 'gemini-3-flash-preview';

export async function transcribeAudio(base64Audio: string, mimeType: string = 'audio/webm'): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio,
            },
          },
          {
            text: "Please transcribe the audio accurately in the language it is spoken. If it's Bengali, write in Bengali. If it's English, write in English. Provide only the text transcription, no extra commentary."
          }
        ]
      },
    });

    return response.text || "Transcription failed. No text returned.";
  } catch (error) {
    console.error("Transcription Error:", error);
    throw new Error("Failed to transcribe audio. Please check your connection or API key.");
  }
}
