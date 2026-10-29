"""Shared, lazily-loaded embedding and reranking models.

Models load on first use rather than at import time, so importing a service
(e.g. in tests or scripts) never triggers a model download, and the API
process holds a single copy of each model.
"""

import threading

from app.core.config import settings


class _LazyModel:
    def __init__(self, loader, name: str):
        self._loader = loader
        self.name = name
        self._model = None
        self._lock = threading.Lock()

    @property
    def model(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = self._loader(self.name)
        return self._model


class LazyEmbedder(_LazyModel):
    def __init__(self, name: str):
        def load(model_name):
            from sentence_transformers import SentenceTransformer
            return SentenceTransformer(model_name)
        super().__init__(load, name)

    def encode(self, *args, **kwargs):
        return self.model.encode(*args, **kwargs)


class LazyCrossEncoder(_LazyModel):
    def __init__(self, name: str):
        def load(model_name):
            from sentence_transformers import CrossEncoder
            return CrossEncoder(model_name)
        super().__init__(load, name)

    def predict(self, *args, **kwargs):
        return self.model.predict(*args, **kwargs)


embedder = LazyEmbedder(settings.EMBEDDING_MODEL)
cross_encoder = LazyCrossEncoder(settings.RERANKER_MODEL)
