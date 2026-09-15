/**
 * MenuUploadPage.jsx
 * ==================
 * PDF Menu Uploader and Gemini Multimodal Parser (Phase 7C).
 * Uploads a mess menu PDF, sends it to Gemini native PDF understanding,
 * displays structured dish & ingredient preview, and commits to mess_menu table.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BookOpen,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  Utensils,
  Save,
  RefreshCw,
  Clock
} from 'lucide-react'
import { nourishApi } from '../../services/api'
import LoadingSpinner from '../../components/common/LoadingSpinner'

export default function MenuUploadPage() {
  const fileInputRef = useRef(null)

  const [selectedFile, setSelectedFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState(null)
  const [parseError, setParseError] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Active today's menu preview
  const [activeMenuMeal, setActiveMenuMeal] = useState('lunch')
  const [currentMenu, setCurrentMenu] = useState(null)
  const [loadingCurrent, setLoadingCurrent] = useState(false)

  // Fetch current menu for selected meal
  const loadCurrentMenu = useCallback(async (meal) => {
    setLoadingCurrent(true)
    try {
      const res = await nourishApi.getCurrentMenu(meal)
      if (res.data?.success) {
        setCurrentMenu(res.data.menu || null)
      } else {
        setCurrentMenu(null)
      }
    } catch {
      setCurrentMenu(null)
    } finally {
      setLoadingCurrent(false)
    }
  }, [])

  useEffect(() => {
    loadCurrentMenu(activeMenuMeal)
  }, [activeMenuMeal, loadCurrentMenu])

  // Handle file select
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setParseError('Only PDF files are supported for menu parsing.')
      return
    }

    setSelectedFile(file)
    setParseError(null)
    setParseResult(null)
    setSaveSuccess(false)
  }

  // Send to Gemini backend parser
  const handleUploadAndParse = async () => {
    if (!selectedFile) return
    setParsing(true)
    setParseError(null)
    setParseResult(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await nourishApi.uploadMenuPdf(formData)
      if (res.data?.success) {
        setParseResult(res.data)
      } else {
        setParseError(res.data?.error || 'Failed to parse menu with Gemini.')
      }
    } catch (err) {
      console.error('Menu parse error:', err)
      setParseError(
        err.detail ||
        err.response?.data?.detail ||
        'Failed to connect to Gemini menu parser.'
      )
    } finally {
      setParsing(false)
    }
  }

  // Save parsed result to database
  const handleSaveMenu = async () => {
    if (!parseResult) return
    setSaving(true)
    setSaveSuccess(false)

    try {
      let payload = {}
      if (parseResult.meals && Array.isArray(parseResult.meals)) {
        payload = { meals: parseResult.meals }
      } else if (parseResult.parsed) {
        // Handle single or wrapped object
        if (parseResult.parsed.meals) {
          payload = { meals: parseResult.parsed.meals }
        } else {
          payload = {
            meal_type: parseResult.parsed.meal_type || 'lunch',
            effective_date: parseResult.parsed.effective_date || new Date().toISOString().split('T')[0],
            dishes: parseResult.parsed.dishes || [],
          }
        }
      }

      const res = await nourishApi.saveConfirmedMenu(payload)
      if (res.data?.success) {
        setSaveSuccess(true)
        loadCurrentMenu(activeMenuMeal)
      } else {
        setParseError(res.data?.error || 'Failed to save confirmed menu.')
      }
    } catch (err) {
      console.error('Save menu error:', err)
      setParseError(err.detail || 'Failed to save menu to database.')
    } finally {
      setSaving(false)
    }
  }

  // Format parsed meals list
  const mealsList = parseResult?.meals || parseResult?.parsed?.meals || []

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
              NOURISH Menu Engine
            </span>
            <span className="badge badge-emerald text-[11px]">
              <Sparkles className="w-3 h-3" />
              Google Gemini Multimodal
            </span>
          </div>
          <h1 className="page-header">Weekly Mess Menu PDF Parser</h1>
          <p className="page-subheader">
            Upload institutional mess menu PDFs. Gemini automatically extracts daily dishes, ingredients, and portion ratios.
          </p>
        </div>
      </div>

      {/* PDF Upload Card */}
      <div className="card border border-amber-500/20 p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Upload className="w-4 h-4 text-amber-400" />
            Upload Menu Schedule Document
          </h2>
          <span className="text-xs text-slate-500">Supported: PDF up to 10MB</span>
        </div>

        {/* Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="rounded-2xl border-2 border-dashed border-white/10 hover:border-amber-500/40 p-8 text-center cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.03]"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf,application/pdf"
            className="hidden"
          />

          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">{selectedFile.name}</p>
                <p className="text-xs text-slate-500 font-mono">
                  {(selectedFile.size / 1024).toFixed(1)} KB • PDF Document
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-slate-200 mb-1">
                Drag and drop your mess menu PDF, or click to browse
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                Upload your hostel mess weekly roster table (e.g. MESS-MENU.pdf).
              </p>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Gemini Flash natively interprets tables, columns, and ingredient quantities.
          </p>

          <button
            type="button"
            onClick={handleUploadAndParse}
            disabled={!selectedFile || parsing}
            className="btn-primary py-2.5 px-6 text-xs flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-glow-amber disabled:opacity-50"
          >
            {parsing ? <LoadingSpinner size="sm" /> : <Sparkles className="w-3.5 h-3.5" />}
            {parsing ? 'Parsing with Gemini…' : 'Analyze & Extract Menu'}
          </button>
        </div>

        {/* Error Alert */}
        {parseError && (
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start gap-3 text-xs animate-slide-up">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <p className="font-semibold text-sm mb-0.5">Menu Parsing Failed</p>
              <p>{parseError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Structured Parse Result Review Card */}
      {parseResult && (
        <div className="card border border-emerald-500/30 p-6 space-y-5 animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2">
                <span className="badge badge-emerald text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Gemini Extraction Complete
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Found {mealsList.length || 1} meal schedule(s)
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-100 mt-1">
                Extracted Dishes & Ingredient Ratios
              </h3>
            </div>

            <button
              onClick={handleSaveMenu}
              disabled={saving}
              className="btn-primary py-2.5 px-6 text-xs flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-glow-emerald disabled:opacity-50 self-start sm:self-auto"
            >
              {saving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving to Database…' : 'Confirm & Save Schedule'}
            </button>
          </div>

          {/* Success Banner */}
          {saveSuccess && (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-3 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Menu Successfully Committed!</p>
                <p>The mess schedule and portion depletion rules are now active in the database.</p>
              </div>
            </div>
          )}

          {/* Meals Display Grid */}
          <div className="space-y-4">
            {mealsList.length > 0 ? (
              mealsList.map((m, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                        {m.meal_type || `Meal ${idx + 1}`}
                      </span>
                      {m.day_of_week && (
                        <span className="text-xs text-slate-300 font-medium">
                          {m.day_of_week}
                        </span>
                      )}
                    </div>
                    {m.effective_date && (
                      <span className="text-xs font-mono text-slate-500">
                        Date: {m.effective_date}
                      </span>
                    )}
                  </div>

                  {/* Dishes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {(m.dishes || []).map((dish, dIdx) => (
                      <div
                        key={dIdx}
                        className="p-3 rounded-xl bg-slate-950/60 border border-white/[0.06] space-y-2"
                      >
                        <p className="text-xs font-semibold text-slate-200">
                          {dish.dish_name || dish.name || `Dish ${dIdx + 1}`}
                        </p>

                        {/* Ingredients list */}
                        {dish.ingredients && Array.isArray(dish.ingredients) && (
                          <div className="flex flex-wrap gap-1.5">
                            {dish.ingredients.map((ing, iIdx) => (
                              <span
                                key={iIdx}
                                className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-400 border border-white/[0.06] font-mono"
                              >
                                {typeof ing === 'string'
                                  ? ing
                                  : `${ing.name || ing.item}: ${ing.qty_per_student || ing.qty || ''}${ing.unit || ''}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <pre className="p-4 rounded-xl bg-slate-950/80 border border-white/[0.06] text-xs font-mono text-slate-300 overflow-x-auto">
                {JSON.stringify(parseResult, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Currently Saved Active Menu Card */}
      <div className="card border border-white/[0.08] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Utensils className="w-4 h-4 text-amber-400" />
            Currently Active Menu in Database
          </h3>

          {/* Meal tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/60 border border-white/[0.06]">
            {['breakfast', 'lunch', 'dinner'].map((meal) => (
              <button
                key={meal}
                onClick={() => setActiveMenuMeal(meal)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                  activeMenuMeal === meal
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-glow-amber'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {meal}
              </button>
            ))}
          </div>
        </div>

        {loadingCurrent ? (
          <div className="py-10 flex justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : !currentMenu || !currentMenu.dishes?.length ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No active menu currently saved for {activeMenuMeal}. Upload a weekly menu PDF above to populate this.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Service: <strong className="text-slate-200 capitalize">{activeMenuMeal}</strong></span>
              <span className="font-mono">Effective: {currentMenu.effective_date}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {currentMenu.dishes.map((d, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5"
                >
                  <p className="text-xs font-semibold text-slate-200">{d.dish_name}</p>
                  {d.ingredients && (
                    <div className="flex flex-wrap gap-1">
                      {d.ingredients.map((ing, iIdx) => (
                        <span
                          key={iIdx}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/80 font-mono"
                        >
                          {typeof ing === 'string' ? ing : ing.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
