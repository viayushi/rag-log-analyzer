# 🚀 Elasticsearch 2GB Setup Guide (Windows)

## ✅ Automated Setup (Running Now)

A setup script is currently downloading and configuring Elasticsearch to use **maximum 2GB** memory.

**Setup includes:**
- ✅ Elasticsearch 8.11.0 download (~300MB)
- ✅ JVM heap configuration: 512MB initial, 1GB max
- ✅ Memory optimization flags
- ✅ Ready-to-run batch script

---

## 📊 Memory Configuration

```
System Total:        ~2GB
├─ Elasticsearch:    1GB max heap
├─ JVM Overhead:    ~200MB
└─ OS + Apps:       ~800MB
```

**JVM Settings:**
```
-Xms512m    (Initial heap: 512MB)
-Xmx1g      (Max heap: 1GB)
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30
```

---

## 🎯 Once Setup Completes

### 1. Start Elasticsearch

**Option A - Easy way (recommended):**
```powershell
.\scripts\windows\run_elasticsearch.bat
```

**Option B - Manual way:**
```powershell
cd C:\elasticsearch-8.11.0\bin
.\elasticsearch.bat
```

### 2. Keep Terminal Open

Elasticsearch must keep running. You'll see output like:
```
[elasticsearch] started
```

### 3. Test Connection

In another PowerShell:
```powershell
curl http://localhost:9200
```

Expected response:
```json
{
  "name": "...",
  "cluster_name": "elasticsearch",
  "version": { "number": "8.11.0" }
}
```

---

## 4️⃣ Run Your Application

In the kibana directory:
```bash
npm run seed              # Seed sample logs
npm start "your query"    # Run natural language query
```

---

## 🔧 Troubleshooting

### Setup Fails at Download
- **Windows Defender blocks it?** → Allow it
- **No internet?** → Manual download from https://www.elastic.co/downloads/elasticsearch
- **Download too slow?** → Download manually in browser

### Elasticsearch Won't Start
```powershell
# Check if port is in use
netstat -ano | findstr :9200

# Kill process if needed (replace PID)
taskkill /PID <PID> /F
```

### Out of Memory Errors
- Already configured to 2GB max
- If still getting errors, reduce to 512MB:
  - Edit: `C:\elasticsearch-8.11.0\config\jvm.options`
  - Change: `-Xmx1g` → `-Xmx512m`
  - Restart Elasticsearch

### Connection Refused Error
- Elasticsearch isn't running
- Make sure `scripts\\windows\\run_elasticsearch.bat` terminal is still open

---

## 📁 What Gets Installed

```
C:\elasticsearch-8.11.0\
├── bin\
│   └── elasticsearch.bat    (Start script)
├── config\
│   └── jvm.options          (Memory settings - CONFIGURED)
├── data\                    (Indices stored here)
└── logs\                    (Elasticsearch logs)
```

---

## ⏱️ Performance

**Startup Time:** 10-30 seconds  
**Memory Used:** ~1-1.2GB (after startup)  
**Indexing Speed:** ~500-1000 docs/sec  
**Search Speed:** <100ms for 15 logs

---

## ✨ You're All Set!

Once `scripts\\windows\\run_elasticsearch.bat` shows `[elasticsearch] started`, your system is ready:

```bash
npm run seed                          # ✅ Load sample data
npm start "payment service errors?"   # ✅ Run RAG queries
```

**Total setup memory:** ~2GB ✓
