**RAG-based Log Analyzer using Elasticsearch**

Built a Retrieval-Augmented Generation (RAG) system on top of Elasticsearch to replace manual log filtering with natural language querying. The system retrieves relevant logs using hybrid search and uses an LLM to generate human-readable root cause analysis.

**Debugging systems using tools like Kibana requires:**
Manual filters
Keyword guessing
Time-consuming exploration
Engineers often ask:
“Why is payment service failing?”
“What caused this error spike?”
Semantic Search using Embeddings: Converts logs & queries into vectors, Finds meaning, not just keywords

Hybrid Retrieval (BM25 + Vector)
Combines:
keyword relevance
semantic similarity

Context-Aware LLM Responses
Uses retrieved logs to generate:
explanations
root cause
Traditional log search cannot answer these directly.

Subscriber based (unique) identification

**Impact**
Reduced debugging time
Eliminated manual Kibana filtering
Improved observability using AI

Backend: Node.js
Search Engine: Elasticsearch
LLM API: Gemini
Environment: Local setup/ sandbox


Architecture 
User Query
   ↓
Embedding Model (convert query → vector)
   ↓
Elasticsearch
   ↙            ↘
Keyword Search   Vector Search
   ↘            ↙
   Hybrid Results (combined)
         ↓
       LLM
         ↓
Final Answer
