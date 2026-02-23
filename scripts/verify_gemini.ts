
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

async function verifyGemini() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    console.log("Checking API Key...", apiKey ? "Present" : "Missing");

    if (!apiKey) {
        console.error("No API Key found in env!");
        process.exit(1);
    }

    // List available models using fetch
    try {
        console.log("\nListing Available Models...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        if (data.models) {
            console.log("Available Models:", data.models.map((m: any) => m.name).join(", "));
        } else {
            console.error("ListModels Failed:", data);
        }

    } catch (e: any) {
        console.error("ListModels Error:", e.message);
    }
}

verifyGemini();
