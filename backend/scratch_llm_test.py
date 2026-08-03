import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.llm import LLMAdapter

async def main():
    adapter = LLMAdapter()
    print(f"Using model: {adapter.model}")
    
    prompt = "Extract concepts from this text: Machine learning is a field of study that gives computers the ability to learn without being explicitly programmed."
    system = 'You are a knowledge graph expert. Output ONLY valid JSON. {"concepts": [{"id": "C1", "label": "Machine Learning", "type": "Topic", "description": "field of study"}], "relationships": []}'
    
    try:
        raw_output = await adapter.generate_full_response(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500
        )
        print("\n--- LLM Output ---")
        print(raw_output)
    except Exception as e:
        print(f"\n--- LLM Error ---")
        print(e)

if __name__ == "__main__":
    asyncio.run(main())
