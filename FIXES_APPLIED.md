# Fixes Applied

## Issues Fixed

### 1. Duplicate Documents in Learning Materials ✓
**Problem:** Documents were being uploaded multiple times, causing duplicates in the UI.

**Solution:**
- Added duplicate check before inserting new documents (by filename + course_id)
- Added deduplication in the API response (keeps most recent version)
- Created cleanup endpoint to remove existing duplicates
- Added "Clean Duplicates" button in the UI

**Files Changed:**
- `backend/app/api/documents.py` - Added duplicate prevention logic and cleanup endpoint
- `frontend/src/pages/CourseDetail.tsx` - Added cleanup button

### 2. Graph Showing Template Instead of Generated Content ✓
**Problem:** The knowledge graph was showing a generic template instead of content generated from course documents.

**Solution:**
- Added automatic graph generation trigger after all documents finish processing
- Study Mode now checks for existing graphs on mount and loads them automatically
- Added new endpoint to fetch all graphs for a course
- Added manual "Generate Graph" button for on-demand generation
- Improved loading states and user feedback

**Files Changed:**
- `backend/app/api/documents.py` - Added auto-trigger graph generation
- `backend/app/api/graphs.py` - Added course graphs endpoint
- `frontend/src/pages/StudyMode.tsx` - Added graph checking on mount
- `frontend/src/pages/CourseDetail.tsx` - Added generate graph button

### 3. Chat Not Working (Ollama 500 Error) ✓
**Problem:** Chat was failing with "Ollama returned 500" errors and not providing contextual answers.

**Solution:**
- **Added RAG (Retrieval Augmented Generation)**: Chat now retrieves relevant context from uploaded course documents
- **Added reranking**: Uses cross-encoder reranker to improve relevance of retrieved documents
- **Better error handling**: Graceful error messages instead of 500 errors
- **Timeout increase**: Extended timeout to 60 seconds for LLM calls
- **Improved prompts**: Enhanced tutor system prompt to use course materials and reference sources

**Files Changed:**
- `backend/app/services/rag.py` - NEW: RAG retrieval service with Qdrant integration
- `backend/app/services/tutor.py` - Enhanced with RAG support and better error handling
- `backend/app/api/chat.py` - Added RAG context retrieval
- `backend/app/api/sessions.py` - Updated to pass course_id and return sources
- `backend/app/models/graph.py` - Added sources field to ChatMessage model
- `frontend/src/components/graph/TutorChat.tsx` - Added document source display
- `frontend/src/store/graphStore.ts` - Updated to handle sources in chat messages

### 4. Chat Document References ✓
**Problem:** Chat responses didn't reference the source documents.

**Solution:**
- Chat now shows which documents were used to generate each answer
- Displays document filename and relevance score
- Beautiful purple-themed source cards below assistant responses
- Sources are stored in database for future reference

## API Endpoints Added

### 1. Clean Up Duplicates
```
POST /documents/cleanup-duplicates
```
Removes duplicate documents from database, keeping only the most recent version of each filename.

### 2. Get Course Graphs
```
GET /graph/course/{course_id}
```
Returns all knowledge graphs for a course, sorted by creation date.

## New Services Created

### RAG Service (`backend/app/services/rag.py`)
Retrieves relevant context from course documents using:
- Vector similarity search (Qdrant)
- Cross-encoder reranking for better relevance
- Returns formatted context and source metadata

## How to Test

### Fix Duplicates:
1. Go to Course Detail page
2. Click "Clean Duplicates" button
3. Confirm the action
4. Verify duplicates are removed

### Generate Graph:
1. Go to Course Detail page
2. Click "Generate Graph" button
3. Wait for confirmation message
4. Click "Enter Study Mode"
5. Verify graph loads with real data (not template)

### Test Chat with Document References:
1. Enter Study Mode
2. Ask a question about the course material
3. Watch for "Searching course materials & thinking..." loading state
4. Verify response includes relevant information from documents
5. Check that source documents are displayed below the answer with filenames and relevance scores

### Auto-Generation:
1. Upload new documents to a course
2. Wait for processing to complete
3. Graph should auto-generate (check backend logs)
4. Enter Study Mode - graph should load automatically

## Technical Details

### RAG Pipeline:
1. User asks question
2. Query is embedded using sentence-transformers
3. Similar chunks retrieved from Qdrant (top 10)
4. Cross-encoder reranker re-scores chunks (top 5 kept)
5. Retrieved context added to system prompt
6. LLM generates answer based on course materials
7. Sources attached to response and displayed in UI

### Error Handling:
- Graceful fallbacks if Qdrant is unavailable
- Clear error messages for LLM failures
- Timeout protection (60 seconds)
- Detailed logging for debugging

## Notes

- The auto-generation happens after the last pending document finishes processing
- There's a 2-second delay before graph generation to allow database to settle
- Existing graphs are automatically loaded when entering Study Mode
- Users can manually trigger graph generation at any time
- Chat now requires documents to be processed and stored in Qdrant to work properly
- Sources are only shown when relevant documents are found (relevance > threshold)

