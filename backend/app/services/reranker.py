from sentence_transformers import CrossEncoder

class Reranker:
    def __init__(self):
        # The cross encoder jointly scores query and document pairs natively
        try:
            self.model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        except Exception as e:
            print(f"Reranker loading delayed or failed: {e}")

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        if not documents:
            return []
        
        pairs = [[query, doc] for doc in documents]
        scores = self.model.predict(pairs)
        return scores.tolist()

reranker_client = Reranker()
