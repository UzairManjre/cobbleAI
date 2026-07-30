import asyncio
from app.services.llm import LLMAdapter

async def main():
    llm = LLMAdapter()
    print("Sending request...")
    try:
        res = await llm.generate_full_response(
            system="You are a helpful assistant.",
            messages=[{"role": "user", "content": "Say hello!"}],
            max_tokens=100
        )
        print("Response:", res)
    except Exception as e:
        print("Exception:", e)

asyncio.run(main())
