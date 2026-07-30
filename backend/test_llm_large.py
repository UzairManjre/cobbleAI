import asyncio
from app.services.llm import LLMAdapter
from app.services.advanced_graph_generator import CONCEPT_EXTRACTION_PROMPT

async def main():
    llm = LLMAdapter()
    print("Sending large request...")
    text = "Machine learning is a field of artificial intelligence." * 1000 # 50k chars, ~12k tokens
    
    prompt = CONCEPT_EXTRACTION_PROMPT.format(text=text)
    try:
        res = await llm.generate_full_response(
            system=CONCEPT_EXTRACTION_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=8192
        )
        print("Response length:", len(res))
    except Exception as e:
        print("Exception:", e)

asyncio.run(main())
