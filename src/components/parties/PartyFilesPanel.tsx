import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, FileText, ImageIcon, Trash2, Upload } from 'lucide-react'
import { useAppStore } from '../../store/useStore'
import {
  deletePartyFileRemote,
  fetchPartyFileBlob,
  listPartyFiles,
  putParty,
  uploadPartyFile,
} from '../../lib/db/api'
import { formatDisplayDate } from '../../lib/dates'
import type { Party, PartyFile } from '../../types'

function kindFromMime(mime: string): PartyFile['kind'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  return 'other'
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read file'))
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function PartyFilesPanel({ party }: { party: Party }) {
  const dbConnected = useAppStore((s) => s.dbConnected)
  const dbUrl = useAppStore((s) => s.dbUrl)
  const dbKey = useAppStore((s) => s.dbKey)
  const localFiles = useAppStore((s) => s.partyFiles)
  const addLocalPartyFile = useAppStore((s) => s.addLocalPartyFile)
  const removeLocalPartyFile = useAppStore((s) => s.removeLocalPartyFile)

  const [remoteFiles, setRemoteFiles] = useState<PartyFile[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [fileDate, setFileDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preview, setPreview] = useState<PartyFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const loadRemote = useCallback(async () => {
    if (!dbConnected || !dbUrl.trim() || !dbKey.trim()) return
    setLoading(true)
    setError(null)
    try {
      const files = await listPartyFiles(dbUrl, dbKey, party.id, {
        from: from || undefined,
        to: to || undefined,
      })
      setRemoteFiles(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [dbConnected, dbUrl, dbKey, party.id, from, to])

  useEffect(() => {
    void loadRemote()
  }, [loadRemote])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      if (!preview) {
        setPreviewUrl(null)
        setPreviewError(null)
        return
      }
      setPreviewLoading(true)
      setPreviewError(null)
      if (previewUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
      try {
        if (preview.dataUrl) {
          if (!cancelled) {
            setPreviewUrl(preview.dataUrl)
            previewUrlRef.current = null
          }
          return
        }
        if (!dbConnected || !dbUrl.trim() || !dbKey.trim()) {
          throw new Error('Reconnect to office database to preview.')
        }
        const blob = await fetchPartyFileBlob(dbUrl, dbKey, preview.id)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        setPreviewUrl(url)
      } catch (err) {
        if (!cancelled) {
          setPreviewUrl(null)
          setPreviewError(
            err instanceof Error ? err.message : 'Preview failed',
          )
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    }
    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [preview, dbConnected, dbUrl, dbKey])

  const files = useMemo(() => {
    if (dbConnected) return remoteFiles
    let list = localFiles.filter((f) => f.partyId === party.id)
    if (from) list = list.filter((f) => f.fileDate >= from)
    if (to) list = list.filter((f) => f.fileDate <= to)
    return [...list].sort((a, b) => b.fileDate.localeCompare(a.fileDate))
  }, [dbConnected, remoteFiles, localFiles, party.id, from, to])

  async function onSave() {
    if (!pendingFile) {
      setError('Choose an image or PDF first.')
      return
    }
    const mime = pendingFile.type
    if (!mime.startsWith('image/') && mime !== 'application/pdf') {
      setError('Only images and PDFs are allowed.')
      return
    }
    const displayTitle =
      title.trim() || pendingFile.name.replace(/\.[^.]+$/, '') || 'Untitled'

    setSaving(true)
    setError(null)
    try {
      if (dbConnected && dbUrl.trim() && dbKey.trim()) {
        await putParty(dbUrl, dbKey, party)
        await uploadPartyFile(dbUrl, dbKey, party.id, {
          file: pendingFile,
          title: displayTitle,
          fileDate,
        })
        await loadRemote()
      } else {
        const dataUrl = await readAsDataUrl(pendingFile)
        addLocalPartyFile({
          id: `file-local-${Date.now()}`,
          partyId: party.id,
          title: displayTitle,
          originalName: pendingFile.name,
          mimeType: mime,
          kind: kindFromMime(mime),
          fileDate,
          createdAt: new Date().toISOString(),
          dataUrl,
        })
      }
      setTitle('')
      setPendingFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(file: PartyFile) {
    if (!confirm(`Delete “${file.title}”?`)) return
    try {
      if (dbConnected && dbUrl.trim() && dbKey.trim() && !file.dataUrl) {
        await deletePartyFileRemote(dbUrl, dbKey, file.id)
        await loadRemote()
      } else {
        removeLocalPartyFile(file.id)
      }
      if (preview?.id === file.id) setPreview(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="mb-1 text-sm font-semibold">Add photo or PDF</p>
        <p className="mb-3 text-xs text-zinc-500">
          Separate from invoices
          {dbConnected
            ? ' · saved in that party’s backup folder on this PC'
            : ' · saved on this device until office DB is connected'}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Name</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Site photo June"
              className="w-48 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-500">Date</span>
            <input
              type="date"
              value={fileDate}
              onChange={(e) => setFileDate(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-500">File</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              className="max-w-[220px] text-xs"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--modi-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {pendingFile && (
          <p className="mt-2 text-xs text-zinc-500">
            Selected: {pendingFile.name}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <p className="text-sm font-semibold">Saved files</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-zinc-500">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-zinc-500">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1.5"
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {loading && (
          <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
        )}
        {!loading && files.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-200 py-8 text-center text-sm text-zinc-500">
            No photos or PDFs in this date range.
          </p>
        )}

        <ul className="divide-y divide-zinc-100">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
                  {file.kind === 'image' ? (
                    <ImageIcon className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">
                    {file.title}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatDisplayDate(file.fileDate)}
                    {file.originalName ? ` · ${file.originalName}` : ''}
                    {file.kind === 'pdf' ? ' · PDF' : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPreview(file)}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(file)}
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={preview.title}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="font-semibold">{preview.title}</p>
                <p className="text-xs text-zinc-500">
                  {formatDisplayDate(preview.fileDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-4">
              {previewLoading && (
                <p className="text-center text-sm text-zinc-500">
                  Loading preview…
                </p>
              )}
              {!previewLoading && previewError && (
                <p className="text-center text-sm text-red-600">{previewError}</p>
              )}
              {!previewLoading && previewUrl && preview.kind === 'image' && (
                <img
                  src={previewUrl}
                  alt={preview.title}
                  className="mx-auto max-h-[70vh] max-w-full rounded-lg object-contain"
                />
              )}
              {!previewLoading && previewUrl && preview.kind !== 'image' && (
                <iframe
                  title={preview.title}
                  src={previewUrl}
                  className="h-[70vh] w-full rounded-lg border border-zinc-200 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
