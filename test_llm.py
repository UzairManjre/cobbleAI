import asyncio
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))
except ImportError:
    pass

from app.services.llm import LLMAdapter

async def test_llm():
    adapter = LLMAdapter(model="gemma4:e2b")
    print(f"Testing LLM with model: {adapter.model} at {adapter.base_url}")
    
    system = "You are a helpful tutor. Format: Socratic style."
    messages = [{"role": "user", "content": "Explain what a variable is in programming."}]
    
    print("Generating response...")
    try:
        async for chunk in adapter.generate_response(system, messages):
            print(chunk, end="", flush=True)
        print("\nDone.")
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    asyncio.run(test_llm())
