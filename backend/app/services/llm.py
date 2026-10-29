import os
import json
import asyncio
import httpx
from app.core.config import settings
from typing import AsyncGenerator

# Failure strings the adapter yields in place of model tokens. Match these exactly: a real answer
# may well start with "Error" (error-correcting codes, "Errors in..."), and v1 matched "Error:" only.
LLM_ERROR_PREFIXES = ("Error: ", "Error connecting to Ollama")


def is_llm_error(chunk: str) -> bool:
    return chunk.startswith(LLM_ERROR_PREFIXES)


class LLMAdapter:
    def __init__(self, base_url: str = None, model: str = None, timeout: int = 120):
        # Ollama native API is at /api/chat
        raw_url = base_url or settings.LLM_BASE_URL
        
        # Clean URL: strip trailing slash and /v1 suffix if present
        self.base_url = raw_url.rstrip("/").removesuffix("/v1")
        self.model = model or settings.LLM_MODEL
        self.timeout = 600 # 10 minute timeout for large model loading
        print(f"LLM Adapter Config: URL={self.base_url}, Model={self.model}, Timeout={self.timeout}s")

    async def generate_response(
        self, system: str, messages: list[dict], max_tokens: int = 4096, stream: bool = True,
        temperature: float | None = None, think: bool | None = None,
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
                # Lower temperature for better JSON extraction; callers may override (e.g. grader sampling)
                "temperature": 0.3 if temperature is None else temperature
            }
        }
        if think is not None:
            # False for short structured outputs: a thinking model can spend the whole num_predict
            # budget thinking and return no answer at all
            payload["think"] = think

        try:
            is_thinking = False
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        yield f"Error: Ollama returned {response.status_code} - {error_body.decode()}"
                        return

                    async for line in response.aiter_lines():
                        if not line: continue
                        try:
                            data = json.loads(line)
                            if "error" in data:
                                yield f"Error: {data['error']}"
                                break
                            
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
        self, system: str, messages: list[dict], max_tokens: int = 8192, temperature: float | None = None,
        think: bool | None = None,
    ) -> str:
        """Collect all chunks and return the full response string with retries."""
        import sys
        for attempt in range(2):  # Retry once on failure
            response_text = ""
            error_occurred = False
            
            print(f" [LLM STREAM START] - {self.model}")
            async for chunk in self.generate_response(system, messages, max_tokens, stream=True, temperature=temperature, think=think):
                if is_llm_error(chunk):
                    error_occurred = True
                    response_text = chunk  # Capture the error message
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
            elif not response_text:
                response_text = "Error: Empty response from LLM. Context may be too large or model refused to answer."
        
        raise Exception(f"LLM request failed after retries: {response_text[:200]}")
