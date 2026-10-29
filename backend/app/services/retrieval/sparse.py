"""BM25 sparse vectors for Qdrant.

Documents get BM25 term-frequency weights (saturation + length normalisation)
computed here; Qdrant applies IDF server-side via the sparse vector's
`modifier=IDF`, so together they score as BM25. Queries are bags of unique terms.
No model download is needed, which keeps ingestion and tests fully offline.
"""

import hashlib
import re
from collections import Counter
from functools import lru_cache
from typing import Dict, List

from qdrant_client.models import SparseVector

K1 = 1.2
B = 0.75
AVG_DOC_LEN = 256  # words; chunks are ~400-word windows, slides and pages often shorter

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[+#][+#]?)?")

STOPWORDS = frozenset("""
a about above after again against all am an and any are as at be because been before being below between both
but by can could did do does doing down during each few for from further had has have having he her here hers
herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on
once only or other our ours ourselves out over own same she should so some such than that the their theirs them
themselves then there these they this those through to too under until up very was we were what when where which
while who whom why will with would you your yours yourself yourselves also may might must shall us via per etc
""".split())


@lru_cache(maxsize=1)
def _stemmer():
    from nltk.stem import PorterStemmer
    return PorterStemmer()


@lru_cache(maxsize=50_000)
def _stem(token: str) -> str:
    # Keep short technical tokens (e.g. "c++", "o", "n2") as-is
    if len(token) <= 3 or not token.isalpha():
        return token
    return _stemmer().stem(token)


def tokenize(text: str) -> List[str]:
    return [_stem(t) for t in _TOKEN_RE.findall((text or "").lower()) if t not in STOPWORDS]


def token_id(token: str) -> int:
    # Stable across processes (Python's hash() is salted per process)
    return int(hashlib.md5(token.encode("utf-8")).hexdigest()[:8], 16) & 0x7FFFFFFF


def _to_sparse(weights: Dict[int, float]) -> SparseVector:
    indices = sorted(weights)
    return SparseVector(indices=indices, values=[float(weights[i]) for i in indices])


def encode_document(text: str) -> SparseVector:
    tokens = tokenize(text)
    if not tokens:
        return SparseVector(indices=[], values=[])
    doc_len = len(tokens)
    weights: Dict[int, float] = {}
    for tok, tf in Counter(tokens).items():
        tid = token_id(tok)
        w = tf * (K1 + 1) / (tf + K1 * (1 - B + B * doc_len / AVG_DOC_LEN))
        weights[tid] = weights.get(tid, 0.0) + w
    return _to_sparse(weights)


def encode_query(text: str) -> SparseVector:
    return _to_sparse({token_id(tok): 1.0 for tok in set(tokenize(text))})
