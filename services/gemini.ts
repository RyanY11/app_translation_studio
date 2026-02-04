import { GoogleGenAI } from "@google/genai";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found in environment");
    return new GoogleGenAI({ apiKey });
};

export const translateText = async (text: string, targetLang: string = 'English'): Promise<string> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Translate the following text to ${targetLang}. Return ONLY the translated string, no explanations or quotes.\n\nText: ${text}`,
        });
        return response.text?.trim() || "";
    } catch (error) {
        console.error("Translation failed:", error);
        throw error;
    }
};

export const batchTranslate = async (texts: string[]): Promise<string[]> => {
     try {
        const ai = getClient();
        const prompt = `You are a professional translator for a mobile app. 
        Translate the following array of strings from Chinese to English. 
        Return ONLY a JSON array of strings. Maintain the order exactly.
        
        Source:
        ${JSON.stringify(texts)}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const text = response.text;
        if (!text) return texts.map(() => "");
        
        return JSON.parse(text);
    } catch (error) {
        console.error("Batch translation failed:", error);
        return texts.map(() => "");
    }
}
