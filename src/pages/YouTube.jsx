import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Clapperboard, RefreshCw, Loader2, Plus } from 'lucide-react'
import { fetchAllRecords, createRecord, updateRecord } from '../lib/airtable'
import {
  YT_BASE_ID, T, F, toVideo, toSeries, toClaim, toPhoto, toOutlier, toCost, toRunner,
  runnerState, buildTasks,
} from '../lib/youtube'
import LoadingSpinner from '../components/LoadingSpinner'
import TodayView from '../components/youtube/TodayView'
import BoardView from '../components/youtube/BoardView'
import PhotosView from '../components/youtube/PhotosView'
import ClaimsView from '../components/youtube/ClaimsView'
import PaceView from '../components/youtube/PaceView'
import OutliersView from '../components/youtube/OutliersView'
import VideoSheet from '../components/youtube/VideoSheet'

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'board', label: 'Board' },
  { key: 'photos', label: 'Photos' },
  { key: 'claims', label: 'Claims' },
  { key: 'pace', label: 'Pace' },
  { key: 'outliers', label: 'Outliers' },
]

/** Remembers a preference on this device. Fails quiet in private browsing. */
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch { return initial }
  })
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue]
}

export default function YouTube() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [videos, setVideos] = useState([])
  const [series, setSeries] = useState([])
  const [claims, setClaims] = useState([])
  const [photos, setPhotos] = useState([])
  const [outliers, setOutliers] = useState([])
  const [costs, setCosts] = useState([])
  const [runner, setRunner] = useState(null)
  const [tab, setTab] = usePersisted('yt_tab', 'today')
  const [seriesFilter, setSeriesFilter] = usePersisted('yt_series', 'all')
  const [helperView, setHelperView] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)

  // Nothing is set before the first await: the fetch happens, then state
  // lands in one pass. Callers that want the spinner set `refreshing`
  // themselves (see reload below).
  const load = useCallback(async () => {
    const [vRes, sRes, cRes, pRes, oRes, kRes, rRes] = await Promise.all([
      fetchAllRecords(T.videos, {}, YT_BASE_ID),
      fetchAllRecords(T.series, {}, YT_BASE_ID),
      fetchAllRecords(T.claims, {}, YT_BASE_ID),
      fetchAllRecords(T.sources, {}, YT_BASE_ID),
      fetchAllRecords(T.outliers, {}, YT_BASE_ID),
      fetchAllRecords(T.costs, {}, YT_BASE_ID),
      fetchAllRecords(T.runner, {}, YT_BASE_ID),
    ])
    const firstErr = [vRes, sRes, cRes, pRes, oRes, kRes, rRes].find(r => r.error)
    if (firstErr) setError(firstErr.error); else setError(null)
    const seriesList = (sRes.data || []).map(toSeries)
    const byId = {}
    seriesList.forEach(s => { byId[s.id] = s })
    setSeries(seriesList)
    setVideos((vRes.data || []).map(r => toVideo(r, byId)))
    setClaims((cRes.data || []).map(toClaim))
    setPhotos((pRes.data || []).map(toPhoto))
    setOutliers((oRes.data || []).map(toOutlier))
    setCosts((kRes.data || []).map(toCost))
    setRunner((rRes.data || []).map(toRunner)[0] || null)
    setLoading(false)
    setRefreshing(false)
  }, [])

  const reload = useCallback(async () => {
    setRefreshing(true)
    await load()
  }, [load])

  useEffect(() => { load() }, [load])

  const shown = useMemo(
    () => (seriesFilter === 'all' ? videos : videos.filter(v => v.seriesId === seriesFilter)),
    [videos, seriesFilter],
  )
  const tasks = useMemo(() => buildTasks(shown), [shown])
  const open = useMemo(() => videos.find(v => v.id === openId) || null, [videos, openId])

  /** One write plus a quiet reload, with the error surfaced rather than swallowed. */
  const write = useCallback(async (table, recordId, fields, okMessage) => {
    setBusy(true)
    const { error: err } = await updateRecord(table, recordId, fields, YT_BASE_ID)
    setBusy(false)
    if (err) { toast.error(err); return false }
    if (okMessage) toast.success(okMessage)
    await load()
    return true
  }, [load])

  const onDecideMany = useCallback(async (ids, fields) => {
    if (ids.size === 0) return true
    setBusy(true)
    const idArray = Array.from(ids)
    let failed = 0
    
    const queue = [...idArray]
    const workers = Array(4).fill(0).map(async () => {
      while (queue.length > 0) {
        const id = queue.shift()
        const { error: err } = await updateRecord(T.sources, id, fields, YT_BASE_ID)
        if (err) {
          failed++
        } else {
          ids.delete(id)
        }
      }
    })
    await Promise.all(workers)
    
    if (failed === 0) {
      const action = fields[F.sources.approved] ? 'Approved' : 'Rejected'
      toast.success(`${action} ${idArray.length} photos`)
    } else {
      toast.error(`${failed} failed`)
    }
    
    await load()
    setBusy(false)
    return failed === 0
  }, [load])

  const toggleRunner = async () => {
    if (!runner) { toast.error('No runner row in Airtable yet'); return }
    await write(T.runner, runner.id, { [F.runner.paused]: !runner.paused },
      runner.paused ? 'Runner resumed' : 'Runner paused')
  }

  const addVideo = async () => {
    const subject = window.prompt('Subject (the town, event or person this video is about)')
    if (!subject) return
    const fields = { [F.videos.subject]: subject, [F.videos.stage]: 'Idea' }
    const sId = seriesFilter !== 'all' ? seriesFilter : (series.find(s => s.active)?.id || null)
    if (sId) fields[F.videos.series] = [sId]
    setBusy(true)
    const { data, error: err } = await createRecord(T.videos, fields, YT_BASE_ID)
    setBusy(false)
    if (err) { toast.error(err); return }
    toast.success(`${subject} added`)
    await load()
    if (data?.id) setOpenId(data.id)
  }

  if (loading) return <LoadingSpinner fullScreen />

  const rState = runnerState(runner)
  const dotCls = rState === 'on' ? 'bg-green-500' : rState === 'paused' ? 'bg-amber-500' : 'bg-red-500'
  const rText = rState === 'on' ? 'PC on' : rState === 'paused' ? 'Paused' : 'PC off'

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-3 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Clapperboard size={22} className="text-blue-600" />
          YouTube
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
            <span className={`w-2 h-2 rounded-full ${dotCls}`} />
            {rText}
          </span>
          <button
            onClick={reload}
            title="Refresh"
            className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            onClick={addVideo}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> Video
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Series filter, then the view tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSeriesFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
            seriesFilter === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All series
        </button>
        {series.map(s => (
          <button
            key={s.id}
            onClick={() => setSeriesFilter(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
              seriesFilter === s.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-[72px] px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <TodayView
          videos={shown}
          series={series}
          tasks={tasks}
          runner={runner}
          runnerState={rState}
          helperView={helperView}
          onToggleHelper={() => setHelperView(h => !h)}
          onToggleRunner={toggleRunner}
          onOpen={setOpenId}
          busy={busy}
        />
      )}
      {tab === 'board' && <BoardView videos={shown} onOpen={setOpenId} />}
      {tab === 'photos' && (
        <PhotosView
          videos={shown}
          photos={photos}
          onDecide={(id, fields) => write(T.sources, id, fields)}
          onDecideMany={onDecideMany}
          busy={busy}
        />
      )}
      {tab === 'claims' && (
        <ClaimsView
          videos={shown}
          claims={claims}
          onDecide={(id, decision) => write(T.claims, id, {
            [F.claims.decision]: decision,
            [F.claims.decidedBy]: 'Portal',
            [F.claims.decidedAt]: new Date().toISOString(),
          })}
          busy={busy}
        />
      )}
      {tab === 'pace' && <PaceView videos={shown} series={series} costs={costs} runner={runner} />}
      {tab === 'outliers' && (
        <OutliersView
          outliers={outliers}
          onUse={async (o) => {
            const fields = { [F.videos.subject]: o.takeaway || o.title, [F.videos.stage]: 'Idea', [F.videos.notes]: `From outlier: ${o.title}` }
            const sId = seriesFilter !== 'all' ? seriesFilter : (series.find(s => s.active)?.id || null)
            if (sId) fields[F.videos.series] = [sId]
            setBusy(true)
            const { error: err } = await createRecord(T.videos, fields, YT_BASE_ID)
            setBusy(false)
            if (err) { toast.error(err); return }
            toast.success('Added as an idea')
            reload()
          }}
          busy={busy}
        />
      )}

      {open && (
        <VideoSheet
          video={open}
          series={series}
          claims={claims.filter(c => c.videoId === open.id)}
          photos={photos.filter(p => p.videoId === open.id)}
          costs={costs.filter(c => c.videoId === open.id)}
          helperView={helperView}
          busy={busy}
          onClose={() => setOpenId(null)}
          onWriteVideo={(fields, msg) => write(T.videos, open.id, fields, msg)}
          onDecideClaim={(id, decision) => write(T.claims, id, {
            [F.claims.decision]: decision,
            [F.claims.decidedBy]: 'Portal',
            [F.claims.decidedAt]: new Date().toISOString(),
          })}
          onDecidePhoto={(id, fields) => write(T.sources, id, fields)}
        />
      )}

      {/* Helper preview: shows the page as a VA would see it, changing no data */}
      <button
        onClick={() => setHelperView(h => !h)}
        className="text-xs text-gray-400 hover:text-gray-600 underline"
      >
        {helperView ? 'Back to my view' : 'Preview the VA view'}
      </button>
      {helperView && (
        <p className="text-xs text-gray-500">
          This is a preview of what a helper would see. Nothing you tap here is treated differently.
        </p>
      )}

      {busy && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <Loader2 size={13} className="animate-spin" /> Saving
        </div>
      )}
    </div>
  )
}
