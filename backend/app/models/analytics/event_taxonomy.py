"""
Event taxonomy — canonical definitions for all analytics events.

Centralizes event type constants so every tracker uses the same strings.
Organized by category for discoverability.
"""

from enum import Enum


class EventCategory(str, Enum):
    AUTH = "auth"
    COURSE = "course"
    DOCUMENT = "document"
    GRAPH = "graph"
    SESSION = "session"
    NAVIGATION = "navigation"
    CHAT = "chat"
    RAG = "rag"
    LLM = "llm"
    UI = "ui"


# ── Auth events ──────────────────────────────────────────────
class AuthEvent(str, Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    SIGNUP_COMPLETE = "signup_complete"
    LOGOUT = "logout"


# ── Course events ────────────────────────────────────────────
class CourseEvent(str, Enum):
    COURSE_CREATED = "course_created"
    COURSE_VIEWED = "course_viewed"
    COURSE_JOINED = "course_joined"


# ── Document events ──────────────────────────────────────────
class DocumentEvent(str, Enum):
    DOCUMENT_UPLOADED = "document_uploaded"
    DOCUMENT_PROCESSED = "document_processed"
    DOCUMENT_FAILED = "document_failed"


# ── Graph events ─────────────────────────────────────────────
class GraphEvent(str, Enum):
    GRAPH_GENERATION_STARTED = "graph_generation_started"
    GRAPH_GENERATED = "graph_generated"
    GRAPH_GENERATION_FAILED = "graph_generation_failed"
    GRAPH_VIEWED_2D = "graph_viewed_2d"
    GRAPH_VIEWED_3D = "graph_viewed_3d"


# ── Session events ───────────────────────────────────────────
class SessionEvent(str, Enum):
    SESSION_STARTED = "session_started"
    SESSION_ENDED = "session_ended"


# ── Navigation events ────────────────────────────────────────
class NavigationEvent(str, Enum):
    NODE_VISITED = "node_visited"
    NODE_DWELL = "node_dwell"
    NODE_REVISITED = "node_revisited"
    NEIGHBOR_CLICKED = "neighbor_clicked"
    NODE_CLICKED_3D = "node_clicked_3d"


# ── Chat events ──────────────────────────────────────────────
class ChatEvent(str, Enum):
    QUESTION_ASKED = "question_asked"
    ANSWER_RECEIVED = "answer_received"
    CHAT_STANDALONE_SENT = "chat_standalone_sent"
    THINKING_EXPANDED = "thinking_expanded"
    SOURCE_VIEWED = "source_viewed"


# ── RAG events ───────────────────────────────────────────────
class RAGEvent(str, Enum):
    RAG_QUERY = "rag_query"
    RAG_NO_RESULTS = "rag_no_results"


# ── LLM events ───────────────────────────────────────────────
class LLMEvent(str, Enum):
    LLM_CALL = "llm_call"
    LLM_ERROR = "llm_error"


# ── UI events ────────────────────────────────────────────────
class UIEvent(str, Enum):
    PAGE_VIEW = "page_view"
    MODE_SELECTED = "mode_selected"
    ENTRY_POINT_CHOSEN = "entry_point_chosen"
    API_ERROR = "api_error"


# ── Aggregate types ──────────────────────────────────────────
class AggregateType(str, Enum):
    USER_DAILY = "user_daily"
    USER_WEEKLY = "user_weekly"
    COURSE_DAILY = "course_daily"
    COURSE_WEEKLY = "course_weekly"
    NODE_DAILY = "node_daily"
    GLOBAL_DAILY = "global_daily"
