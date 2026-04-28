# 🔧 Elasticsearch 2GB Setup - Manual Download

The automated download failed due to network issues. **No problem!** Here's the manual 3-step process:

---

## 📥 Step 1: Download Elasticsearch

1. **Open your browser** and go to:
   ```
   https://www.elastic.co/downloads/elasticsearch
   ```

2. **Download Windows version:**
   - Look for: **"Elasticsearch 8.11.0"**
   - Select: **"Windows x86_64"** (.zip file)
   - Size: ~300MB
   - Save to: **Downloads folder**

3. **Wait for download to complete** ⏳

---

## 📦 Step 2: Extract Files

1. **Right-click** on the downloaded `.zip` file
2. Select: **"Extract All..."**
3. Extract to: **`C:\`** (the root C: drive)
4. You should have: `C:\elasticsearch-8.11.0\`

**Verify it exists:**
```powershell
Test-Path C:\elasticsearch-8.11.0\bin\elasticsearch.bat
```
Should show: `True`

---

## ⚙️ Step 3: Configure for 2GB Memory

Open PowerShell **as Administrator** and run:

```powershell
# Create memory-optimized config
@"
## JVM Configuration - 2GB Mode
-Xms512m
-Xmx1g
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30
"@ | Set-Content "C:\elasticsearch-8.11.0\config\jvm.options" -Force

Write-Host "✓ Elasticsearch configured for 2GB memory" -ForegroundColor Green
```

---

## 🚀 Step 4: Start Elasticsearch

### Option A: Using the Quick Start Script

```powershell
cd C:\Users\ayushi.vishwakarma\Desktop\kibana
.\scripts\windows\run_elasticsearch.bat
```

### Option B: Manual Start

```powershell
cd C:\elasticsearch-8.11.0\bin
.\elasticsearch.bat
```

**Expected output (after 10-30 seconds):**
```
[elasticsearch] started
```

---

## ✅ Step 5: Test Connection

Open **another PowerShell** window:

```powershell
curl http://localhost:9200
```

**Should show:**
```json
{
  "name": "...",
  "cluster_name": "elasticsearch",
  "version": { "number": "8.11.0" }
}
```

---

## 🎯 Step 6: Use Your Application

In a **third PowerShell** window:

```powershell
cd C:\Users\ayushi.vishwakarma\Desktop\kibana

npm run seed              # Seed sample logs
npm start "your query"    # Run natural language query
```

---

## 📊 Memory Usage

```
Elasticsearch Heap:  1GB (configurable)
JVM Overhead:       200MB
OS + Apps:          800MB
─────────────────────────
Total:              ~2GB ✓
```

---

## 🛑 Troubleshooting

### Download link doesn't work?
- Try: `https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-windows-x86_64.zip`
- Or search Google for "Elasticsearch 8.11.0 Windows download"

### Elasticsearch won't start?
```powershell
# Check port isn't in use
netstat -ano | findstr :9200

# If stuck, kill old process
taskkill /PID <PID> /F
```

### Out of memory?
Edit: `C:\elasticsearch-8.11.0\config\jvm.options`
```
-Xms256m    ← Change from 512m
-Xmx512m    ← Change from 1g
```

### Configuration file empty or corrupted?
```powershell
# Recreate it
@"
-Xms512m
-Xmx1g
-XX:+UseG1GC
-XX:G1ReservePercent=25
-XX:InitiatingHeapOccupancyPercent=30
"@ | Set-Content "C:\elasticsearch-8.11.0\config\jvm.options" -Force
```

---

## ⏱️ Timeline

- **Download:** 2-5 minutes (300MB file)
- **Extract:** 1-2 minutes
- **Configuration:** < 1 minute
- **First Start:** 10-30 seconds
- **Total Setup:** ~10 minutes

---

## ✨ Done!

Once you see `[elasticsearch] started`, your system is ready:

```bash
npm run seed                               # Load test data
npm start "What's wrong with payments?"    # Ask questions!
```

**Memory footprint: ~2GB** ✓

Need help? Check the other docs:
- [SETUP_2GB_GUIDE.md](SETUP_2GB_GUIDE.md) - Detailed guide
- [ELASTICSEARCH_SETUP.md](ELASTICSEARCH_SETUP.md) - Alternative options
- [README.md](README.md) - Full system documentation
