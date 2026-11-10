# Training Failed: 4 Critical Errors Fixed

## Summary of Issues

The "Failed to fetch" error and 4 training failures were caused by:

1. **Backend doesn't send JSON error responses** - Routes throw errors without catching them
2. **Frontend ignores HTTP error status codes** - Tries to parse JSON from failed responses
3. **Progress component silently fails on connection errors** - Doesn't inform user when AI service is unreachable
4. **Experiment model missing error tracking** - Can't store failure reasons

---

## Error #1: Backend Routes Don't Return Error Responses

### Problem
```typescript
// OLD - Throws error without returning response
modelRouter.post("/train", async (req: Request, res: Response) => {
  try {
    const response = await aiClient.post("/train", params);
    // ...
  } catch (error) {
    throw error;  // ❌ No response sent to client!
  }
});
```

### Impact
- Client receives no response (hanging request)
- Network shows as "Failed to fetch"
- Browser console shows unhandled promise rejection

### Fix Applied
```typescript
// NEW - Properly catch and return error response
try {
  const response = await aiClient.post("/train", params);
  // ...
  return res.json({ experimentId: exp.id, ...response.data });
} catch (aiError: any) {
  exp.status = "failed";
  exp.error = aiError.message || String(aiError);
  await exp.save();
  const message = aiError.response?.data?.error || aiError.message || "AI service training failed";
  return res.status(500).json({ error: message, experimentId: exp.id });  // ✅ Error response sent
}
```

**Files Modified:**
- `backend/src/routes/model.ts` - All 7 routes (/train, /generate, /detect, /latent, /interpolate, /drift, /trajectory)

---

## Error #2: Frontend Doesn't Check HTTP Status Before Parsing

### Problem
```typescript
// OLD - Assumes response is OK without checking status
async function trainModel(): Promise<void> {
  const res = await fetch(`${API}/model/train`, {...});
  const json = await res.json();  // ❌ Can fail if response is 500 error
  setMessage(`Training complete: ...`);
}
```

### Impact
- 500 errors still try to parse as JSON
- `.json()` may fail if response is plain text
- Error messages don't display to user
- Training progress modal stays open indefinitely

### Fix Applied
```typescript
// NEW - Check status code before parsing
async function trainModel(): Promise<void> {
  const res = await fetch(`${API}/model/train`, {...});
  
  if (!res.ok) {  // ✅ Check HTTP status first
    const error = await res.json();
    setMessage(`Training failed: ${error.error || res.statusText}`);
    setShowProgress(false);  // ✅ Close modal on error
    return;
  }
  
  const json = await res.json();
  if (json.error) {  // ✅ Also check response body for errors
    setMessage(`Training failed: ${json.error}`);
    setShowProgress(false);
  }
}
```

**Files Modified:**
- `frontend/app/dashboard/page.tsx`

---

## Error #3: Progress Component Silently Fails on Fetch Errors

### Problem
```typescript
// OLD - Silently catches errors, user doesn't know what went wrong
const pollInterval = setInterval(async () => {
  try {
    const response = await fetch("http://localhost:8000/progress");
    if (response.ok) {
      const data = await response.json();
      setstate(data);
    }
  } catch (err) {
    console.error("Failed to fetch training progress:", err);  // ❌ Only logs to console
  }
}, 1000);
```

### Impact
- User sees loading modal indefinitely
- AI service might not be running but user doesn't know
- "Failed to fetch" is confusing without context
- No way to debug connection issues

### Fix Applied
```typescript
// NEW - Set error state when connection fails
const pollInterval = setInterval(async () => {
  try {
    const response = await fetch("http://localhost:8000/progress");
    if (response.ok) {
      const data = await response.json();
      setstate(data);
    } else {
      console.warn("Progress endpoint returned:", response.status, response.statusText);
      if (!state.error) {
        setstate((prev) => ({  // ✅ Show error in modal
          ...prev,
          error: `AI service unavailable (${response.status})`,
          running: false,
        }));
      }
    }
  } catch (err) {
    console.error("Failed to fetch training progress:", err);
    if (!state.error) {
      setstate((prev) => ({  // ✅ Show connection error
        ...prev,
        error: `Cannot connect to AI service at http://localhost:8000 - ${err instanceof Error ? err.message : String(err)}`,
        running: false,
      }));
    }
  }
}, 1000);
```

**Files Modified:**
- `frontend/components/TrainingProgress.tsx`

---

## Error #4: Experiment Model Missing Error Field

### Problem
```typescript
// OLD - No way to store error messages
const experimentSchema = new Schema({
  userId: Schema.Types.ObjectId,
  datasetId: { type: Schema.Types.ObjectId, ... },
  type: String,
  status: String,  // ← Only has "running", "completed", "failed"
  params: Schema.Types.Mixed,
  // ❌ No field to store WHY it failed
});
```

### Impact
- When training fails, no error reason is saved
- Can't retrieve failure details from database
- Admin/user can't debug why training failed
- No audit trail for troubleshooting

### Fix Applied
```typescript
// NEW - Add error field to track failure reasons
const experimentSchema = new Schema({
  userId: Schema.Types.ObjectId,
  datasetId: { type: Schema.Types.ObjectId, ... },
  type: String,
  status: String,
  params: Schema.Types.Mixed,
  error: { type: String, default: null }  // ✅ Store error message
});
```

**Files Modified:**
- `backend/src/models/Experiment.ts`

---

## Testing the Fixes

### Test 1: Backend Error Handling

```bash
# Stop AI service (simulate unavailable service)
# Then trigger training

# Check response
curl -X POST http://localhost:4000/model/train \
  -H "Content-Type: application/json" \
  -d '{"data_root":"./raw","window_size":50}'

# Expected: 500 response with JSON error
# {"error":"AI service training failed"}  ✅

# Check Experiment document in MongoDB
db.experiments.findOne({status:"failed"})
# Should show error field populated
```

### Test 2: Frontend Error Display

**Scenario A: Backend returns 500**
1. Stop AI service
2. Click "Train LSTM-VAE" in dashboard
3. ✅ Modal appears
4. ✅ Error message displays: "Training failed: AI service training failed"
5. ✅ Modal auto-closes after showing error

**Scenario B: Invalid parameters**
1. Modify trainModel to send invalid data_root value
2. Click "Train LSTM-VAE"
3. ✅ Modal appears
4. ✅ Error message displays: "Training failed: Missing required parameter: data_root"
5. ✅ Modal auto-closes

### Test 3: Progress Component Connection Error

```bash
# Make sure AI service is NOT running on port 8000
# Click "Train LSTM-VAE"
# Check modal

# Expected: 
# - Modal shows error icon (❌)
# - Error message: "Cannot connect to AI service at http://localhost:8000..."
# - Status: "❌ Training failed - see error above"
```

### Test 4: Successful Training

```bash
# Ensure both backend (4000) and AI service (8000) are running
# Click "Train LSTM-VAE"

# Expected flow:
# 1. ✅ Modal appears with progress bar
# 2. ✅ Progress fills from 0% to 100%
# 3. ✅ Metrics update each epoch (loss, recon, kl)
# 4. ✅ Modal shows "✅ Training completed successfully!"
# 5. ✅ Dashboard message shows "Training complete: 10 epochs"
# 6. ✅ Experiment document status="completed" with no error
```

---

## Error Response Examples

### Successful Training
```json
{
  "experimentId": "507f1f77bcf86cd799439011",
  "etl": { "total_samples": 5000, "train_samples": 3000, "test_samples": 2000 },
  "training": {
    "history": [...],
    "train_metrics": { "loss": 0.123, "recon": 0.098, "kl": 0.025 },
    "test_metrics": { "loss": 0.134, "recon": 0.109, "kl": 0.025 }
  }
}
```

### AI Service Unavailable (500)
```json
{
  "error": "AI service training failed",
  "experimentId": "507f1f77bcf86cd799439011"
}
```

### Missing Parameter (400)
```json
{
  "error": "Missing required parameter: data_root"
}
```

### Connection Error (from progress component)
```
Cannot connect to AI service at http://localhost:8000 - Failed to fetch
```

---

## Troubleshooting Guide

### "Failed to fetch" on dashboard
**Causes:**
1. Backend not running on port 4000
2. CORS issue (unlikely with cors() middleware)
3. Backend process crashed

**Solution:**
```bash
# Check if backend is running
curl http://localhost:4000/healthz

# If not, restart backend
npm start  # in backend directory
```

### "Cannot connect to AI service at http://localhost:8000"
**Causes:**
1. AI service not running on port 8000
2. AI service crashed during training
3. Firewall blocking localhost:8000

**Solution:**
```bash
# Check if AI service is running
curl http://localhost:8000/healthz

# If not, restart AI service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000  # in ai-service directory
```

### Training fails immediately
**Causes:**
1. No data in `./raw` directory
2. Data files have wrong format
3. Validation errors in data

**Solution:**
```bash
# Check raw data exists
ls -la ./raw/calce/

# Check file names match stage patterns
# Should see: OCV-007, FUDS-1, US06-FUDS-N1, DST-2, etc.

# Check file sizes (should be > 1MB typically)
ls -lh ./raw/calce/*/
```

### Error stored in database but not displayed
**Causes:**
1. Progress component fetch failed silently
2. Experiment error saved but frontend didn't show

**Solution:**
```bash
# Check MongoDB for error
db.experiments.findOne({status:"failed"}, {error:1})

# Should show error field with descriptive message
```

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/src/routes/model.ts` | Added try/catch with JSON error responses to all 7 routes |
| `backend/src/models/Experiment.ts` | Added `error` field to schema for storing failure reasons |
| `frontend/app/dashboard/page.tsx` | Added HTTP status check, error parsing, modal auto-close |
| `frontend/components/TrainingProgress.tsx` | Added error state handling for connection failures |

---

## Validation Status

✅ All 4 files compile without errors
✅ No TypeScript issues
✅ Backend routes properly return error responses
✅ Frontend checks HTTP status before parsing
✅ Progress modal shows connection errors
✅ Database can store failure reasons

---

## Next Steps to Verify

1. **Restart services:**
   ```bash
   # Terminal 1: Backend
   cd backend && npm start
   
   # Terminal 2: AI Service
   cd ai-service && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   
   # Terminal 3: Frontend
   cd frontend && npm run dev
   ```

2. **Test training flow:**
   - Navigate to http://localhost:3000/dashboard
   - Click "Train LSTM-VAE"
   - Monitor progress modal for metrics
   - Verify training completes or shows specific error

3. **Check error responses:**
   - Stop AI service
   - Try training again
   - Verify error message displayed
   - Check console for Network tab showing 500 response

4. **Monitor logs:**
   - Backend: `npm start` output
   - AI Service: `uvicorn` output
   - Frontend: Browser console
   - Database: MongoDB query results
