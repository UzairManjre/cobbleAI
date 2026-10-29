from app.services.embeddings import cross_encoder


class Reranker:
    """Cross-encoder that jointly scores (query, document) pairs. Loads on first use."""

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        if not documents:
            return []

        pairs = [[query, doc] for doc in documents]
        scores = cross_encoder.predict(pairs)
        return scores.tolist()

reranker_client = Reranker()
