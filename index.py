from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import json
import os

app = FastAPI(title="PDF Translator Professional API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- GROQ AI SETUP ---
API_KEY = os.environ.get("GROQ_API_KEY")
if not API_KEY:
    print("WARNING: No Groq API Key found. Make sure it is set in Render Environment Variables.")

client = Groq(api_key=API_KEY)

class DictionaryRequest(BaseModel):
    word: str
    context: str = ""

# Updated to handle Vercel's pathing
@app.get("/api")
async def health_check():
    return {"status": "Server is running perfectly with Groq!"}

# Updated to /api/dictionary
@app.post("/api/dictionary")
async def get_smart_definition(request: DictionaryRequest):
    try:
        text = request.word.strip()
        word_count = len(text.split())

        if word_count <= 3:
            prompt = f"""
            You are a very expert English-to-Bengali lexicographer. 
            Analyze the word/phrase professionally: "{text}". 
            Context (if any): "{request.context}"
            
            Return ONLY a JSON object with this exact structure:
            {{
                "translation": "Standard Bengali meaning",
                "definition": "Concise English definition",
                "partOfSpeech": "Category",
                "exampleSentence": "A short example sentence in English using the word"
            }}
            """
        else:
            prompt = f"""
            Act as a professional English-to-Bengali translator.
            Identify the context (medical, engineering, literary, or science article) and 
            translate the following text into standard, fluent Bengali with high terminological accuracy.
            Provide only the translation:
            "{text}"
            
            Return ONLY a JSON object with this exact structure (leave the last three fields completely empty):
            {{
                "translation": "The full Bengali translation of the text",
                "definition": "",
                "partOfSpeech": "",
                "exampleSentence": ""
            }}
            """
        
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile", 
            response_format={"type": "json_object"}, 
        )
        
        response_text = chat_completion.choices[0].message.content
        return json.loads(response_text)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")
    
class ChatRequest(BaseModel):
    question: str
    context: str = ""

# Updated to /api/chat
@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest):
    try:
        prompt = f"""
        You are a professional expert AI tutor. 
        Context: "{request.context}"
        Query: "{request.question}"
        Instruction: Provide a concise, clear, helpful response (max 3 sentences).
        Match the language of the Query (English or Bengali).
        """
        
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile", 
        )
        
        return {"answer": chat_completion.choices[0].message.content}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Error: {str(e)}")