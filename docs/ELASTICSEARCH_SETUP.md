# ⚡ Elasticsearch Setup for Windows (No Docker)

## Option 1: Download Elasticsearch Directly (Recommended)

### Step 1: Download Elasticsearch
1. Go to: https://www.elastic.co/downloads/elasticsearch
2. Download **Elasticsearch 8.11.0 for Windows** (.zip file)
3. Extract to: `C:\elasticsearch-8.11.0`

### Step 2: Run Elasticsearch

Open PowerShell **as Administrator** and run:

```powershell
cd C:\elasticsearch-8.11.0\bin
.\elasticsearch.bat
```

You should see output like:
```
loaded settings from [...]
initialized
heap size [512mb]
```

When you see `started` - Elasticsearch is running! ✅

### Step 3: Test Connection

In another PowerShell, run:
```powershell
curl http://localhost:9200
```

Expected response:
```json
{
  "name" : "...",
  "cluster_name" : "elasticsearch",
  "version" : { "number" : "8.11.0" }
}
```

### Step 4: Keep Running

Leave Elasticsearch running in its terminal while you use the application.

---

## Option 2: Elastic Cloud (Free Tier)

If you prefer not to run locally:

1. Go to: https://cloud.elastic.co/registration
2. Sign up for free trial (14 days)
3. Create a deployment
4. Copy the Elasticsearch endpoint (e.g., `https://abc123.es.us-central1.gcp.cloud.es.io:9243`)
5. Update `.env`:
   ```
   ELASTIC_URL=https://abc123.es.us-central1.gcp.cloud.es.io:9243
   ELASTICSEARCH_USERNAME=elastic
   ELASTICSEARCH_PASSWORD=your_password
   ```
6. Modify `src/services/elasticsearch.js` client initialization:
   ```javascript
   export const client = new Client({
     node: process.env.ELASTIC_URL,
     auth: {
       username: process.env.ELASTICSEARCH_USERNAME,
       password: process.env.ELASTICSEARCH_PASSWORD,
     },
   });
   ```

---

## Troubleshooting

### "Connection refused" error
- Make sure Elasticsearch is running in a terminal
- Check if port 9200 is available: `netstat -ano | findstr :9200`

### Port 9200 already in use
```powershell
# Find process using port 9200
netstat -ano | findstr :9200

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F
```

### High memory usage
- Elasticsearch uses 512MB by default
- To reduce: Edit `C:\elasticsearch-8.11.0\config\jvm.options`
- Change `-Xms512m -Xmx512m` to `-Xms256m -Xmx256m`

---

## Next Steps

Once Elasticsearch is running:

```bash
npm run seed              # Seed sample data
npm start "your query"    # Run a query
```

🎯 Your system will work once Elasticsearch is running!
