import os
import json
import asyncio
import httpx
from typing import AsyncGenerator

class LLMAdapter:
    def __init__(self, base_url: str = None, model: str = None, timeout: int = 120):
        # Ollama native API is at /api/chat
        raw_url = base_url or os.getenv("LLM_BASE_URL", "http://localhost:11434")
        
        # Clean URL: strip trailing slash and /v1 suffix if present
        self.base_url = raw_url.rstrip("/").removesuffix("/v1")
        self.model = model or os.getenv("LLM_MODEL", "gemma4:e2b")
        self.timeout = 600 # 10 minute timeout for large model loading
        print(f"LLM Adapter Config: URL={self.base_url}, Model={self.model}, Timeout={self.timeout}s")

    async def generate_response(
        self, system: str, messages: list[dict], max_tokens: int = 4096, stream: bool = True
    ) -> AsyncGenerator[str, None]:

        # Ollama /api/chat format with 32k context
        formatted_messages = [{"role": "system", "content": system}] + messages
        payload = {
            "model": self.model,
            "messages": formatted_messages,
            "stream": stream,
            "options": {
                "num_ctx": 32768,  # Full 32k context for gemma4:e2b
                "num_predict": max_tokens,
                "temperature": 0.3 # Lower temperature for better JSON extraction
            }
        }

        try:
            is_thinking = False
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        yield f"Error: Ollama returned {response.status_code} - {error_body.decode()}"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            if "message" in data:
                                msg = data["message"]
                                
                                # Handle Thinking tokens
                                if "thinking" in msg and msg["thinking"]:
                                    if not is_thinking:
                                        yield "<thought>"
                                        is_thinking = True
                                    yield msg["thinking"]
                                    continue
                                
                                # If we were thinking and now we have content, close the thought tag
                                if is_thinking and "content" in msg and msg["content"]:
                                    yield "</thought>"
                                    is_thinking = False

                                # Standard content token
                                if "content" in msg and msg["content"]:
                                    yield msg["content"]
                            
                            if data.get("done"):
                                if is_thinking:
                                    yield "</thought>"
                                break
                        except (json.JSONDecodeError, KeyError):
                            continue
        except Exception as e:
            yield f"Error connecting to Ollama: {str(e)}"

    async def generate_full_response(
        self, system: str, messages: list[dict], max_tokens: int = 8192
    ) -> str:
        """Collect all chunks and return the full response string with retries."""
        import sys
        for attempt in range(2):  # Retry once on failure
            response_text = ""
            error_occurred = False
            
            print(f" [LLM STREAM START] - {self.model}")
            async for chunk in self.generate_response(system, messages, max_tokens, stream=True):
                if chunk.startswith("Error:"):
                    error_occurred = True
                    print(f"\n   LLM error (attempt {attempt + 1}): {chunk[:100]}")
                    if attempt < 1:
                        await asyncio.sleep(2)  # Wait before retry
                    break
                
                response_text += chunk
                sys.stdout.write(chunk)
                sys.stdout.flush()
            
            print(f"\n [LLM STREAM END]")
            
            if not error_occurred and response_text:
                return response_text
        
        raise Exception(f"LLM request failed after retries: {response_text[:200]}")
