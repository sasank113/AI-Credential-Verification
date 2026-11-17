import React, { useState, useEffect, useRef, useCallback } from 'react';
import { credentialsApi } from '../services/api';
import {
  Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Clock,
  Download, RefreshCw, ChevronDown, ChevronUp, Search,
  Layers, Shield, Zap, BarChart2, ArrowRight, AlertCircle,
  Copy, Check, X, Eye, Info
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Design Tokens
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ISSUED:    { bg: 'rgba(5,150,105,0.08)',  border: 'rgba(5,150,105,0.3)',   text: '#059669', icon: CheckCircle, label: 'Issued' },
  FAILED:    { bg: 'rgba(220,38,38,0.08)',  border: 'rgba(220,38,38,0.3)',   text: '#dc2626', icon: XCircle,     label: 'Failed' },
  DUPLICATE: { bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.3)',  text: '#d97706', icon: Copy,        label: 'Duplicate' },
  INVALID:   { bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.25)', text: '#ef4444', icon: AlertCircle, label: 'Invalid' },
  PENDING:   { bg: '#f8fafc',               border: '#e2e8f0',              text: '#94a3b8', icon: Clock,       label: 'Pending' },
};

const JOB_STATUS_META = {
  QUEUED:                { color: '#94a3b8', icon: Clock,         label: 'Queued' },
  VALIDATING:            { color: '#2563eb', icon: Shield,        label: 'Validating' },
  PROCESSING:            { color: '#7c3aed', icon: Zap,           label: 'Processing' },
  COMPLETED:             { color: '#059669', icon: CheckCircle,   label: 'Completed' },
  COMPLETED_WITH_ERRORS: { color: '#d97706', icon: AlertTriangle, label: 'Partial Success' },
  FAILED:                { color: '#dc2626', icon: XCircle,       label: 'Failed' },
};

const SAMPLE_CSV = `recipient_name,recipient_identifier,gpa,specialization,experience_years
Eleanor Vance,eleanor.vance@ai-org.com,3.9,Deep Learning & Neural Networks,4
Marcus Brody,marcus.brody@security.edu,3.8,Cyber Security & Compliance,6
Sophia Chen,sophia.chen@fintech.io,4.0,Advanced Cloud Architecture,5
David Miller,david.miller@enterprise.com,3.7,Software Engineering,3
Priya Sharma,priya.sharma@biotech.in,3.95,AI in Healthcare & Biotech,2
James Okonkwo,james.okonkwo@legal.ng,3.6,Legal Technology & Governance,7
Amara Osei,amara.osei@data.gh,3.85,Data Engineering & ML Pipelines,3
Liu Wei,liu.wei@quantum.cn,4.0,Quantum Computing & Algorithms,5`;

// ─────────────────────────────────────────────────────────────────────────────
// Helper sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, value, label, color, sublabel }) {
  return (
    <div style={{
      flex: 1, minWidth: 130,
      background: `${color}0d`,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={color} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sublabel}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.PENDING;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text,
    }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function WorkflowSteps() {
  const steps = [
    'Upload CSV', 'Validate Format', 'Check Records',
    'Detect Duplicates', 'Issue via Sunbird RC', 'Store in PostgreSQL', 'View Summary'
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', marginTop: 16 }}>
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--gradient-primary)', color: '#fff', flexShrink: 0,
            }}>{i + 1}</div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight size={11} color="#cbd5e1" style={{ margin: '0 6px', flexShrink: 0 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function CsvPreviewTable({ headers, rows }) {
  if (!headers || !rows) return null;
  return (
    <div style={{ overflow: 'auto', maxHeight: 200, borderRadius: 8, border: '1px solid #e2e8f0', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>#</th>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{ri + 1}</td>
              {headers.map((h, hi) => (
                <td key={hi} style={{ padding: '5px 10px', color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row[h] ?? ''}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > 5 && (
            <tr>
              <td colSpan={headers.length + 1} style={{ padding: '6px 10px', color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>
                + {rows.length - 5} more rows not shown in preview
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ProgressBar({ current, total, color = '#2563eb' }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Upload Progress</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 999,
          background: 'var(--gradient-primary)',
          transition: 'width 0.4s ease',
          boxShadow: '0 2px 6px rgba(37,99,235,0.4)',
        }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
        {pct < 100 ? 'Uploading CSV to server...' : 'Processing records via Sunbird RC — please wait...'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BulkIssuancePage() {
  // Schema state
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState('');

  // File upload state
  const [dragActive, setDragActive] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null); // { headers, rows }
  const [parseError, setParseError] = useState(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState(null);

  // Results state
  const [jobResult, setJobResult] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  // Job history state
  const [jobHistory, setJobHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadSchemas();
    loadJobHistory();
  }, []);

  const loadSchemas = async () => {
    try {
      const data = await credentialsApi.getSchemas();
      setSchemas(data);
      if (data.length > 0) setSelectedSchema(data[0].id);
    } catch { /* silent */ }
  };

  const loadJobHistory = async () => {
    setLoadingHistory(true);
    try {
      const jobs = await credentialsApi.getBulkJobs();
      setJobHistory(Array.isArray(jobs) ? jobs : []);
    } catch { /* silent */ }
    finally { setLoadingHistory(false); }
  };

  // ── Client-side CSV preview parser ────────────────────────────────────────
  const parseCsvPreview = useCallback(async (file) => {
    setParseError(null);
    setCsvPreview(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) { setParseError('The CSV file appears to be empty.'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
      }).filter(r => Object.values(r).some(v => v));
      setCsvPreview({ headers, rows });
    } catch (e) {
      setParseError('Could not parse CSV: ' + e.message);
    }
  }, []);

  // ── Drag & Drop handlers ──────────────────────────────────────────────────
  const handleDrag = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name?.toLowerCase().endsWith('.csv')) {
      setCsvFile(file); setJobResult(null); setSubmitError(null);
      parseCsvPreview(file);
    } else {
      setParseError('Please drop a valid CSV file (.csv extension required).');
    }
  }, [parseCsvPreview]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file); setJobResult(null); setSubmitError(null);
      parseCsvPreview(file);
    }
  };

  const clearFile = () => {
    setCsvFile(null); setCsvPreview(null); setParseError(null);
    setJobResult(null); setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Form submission ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!csvFile || !selectedSchema) return;
    setIsSubmitting(true); setSubmitError(null); setJobResult(null); setUploadProgress(0);
    try {
      const result = await credentialsApi.bulkIssue(
        selectedSchema, csvFile,
        (evt) => { if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100)); }
      );
      setJobResult(result);
      setActiveFilter('ALL');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      loadJobHistory();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setSubmitError(typeof detail === 'string' ? detail : 'Upload failed. Check the file format and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Download helpers ──────────────────────────────────────────────────────
  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bulk_issuance_sample.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadResultsCsv = () => {
    if (!jobResult?.records?.length) return;
    const cols = ['row_number', 'recipient_name', 'recipient_identifier', 'status', 'sunbird_osid', 'error_message'];
    const rows = jobResult.records.map(r =>
      cols.map(c => `"${(r[c] ?? '').toString().replace(/"/g, '""')}"`).join(',')
    );
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bulk_results_${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  // ── Filtered records ──────────────────────────────────────────────────────
  const allRecords = jobResult?.records || [];
  const filteredRecords = allRecords.filter(r => {
    const filterOk = activeFilter === 'ALL' || r.status === activeFilter;
    const q = searchQuery.toLowerCase();
    const searchOk = !q ||
      (r.recipient_name || '').toLowerCase().includes(q) ||
      (r.recipient_identifier || '').toLowerCase().includes(q) ||
      (r.sunbird_osid || '').toLowerCase().includes(q);
    return filterOk && searchOk;
  });

  const filterCounts = {
    ALL:       allRecords.length,
    ISSUED:    allRecords.filter(r => r.status === 'ISSUED').length,
    FAILED:    allRecords.filter(r => r.status === 'FAILED').length,
    DUPLICATE: allRecords.filter(r => r.status === 'DUPLICATE').length,
    INVALID:   allRecords.filter(r => r.status === 'INVALID').length,
  };

  const jobMeta = jobResult ? (JOB_STATUS_META[jobResult.status] || JOB_STATUS_META.COMPLETED) : null;
  const currentSchema = schemas.find(s => s.id === (jobResult?.schema_id || selectedSchema));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'fadeIn 0.3s ease' }}>

      {/* ── PAGE HEADER ───────────────────────────────────────────────────── */}
      <div className="glass-card" style={{
        background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(124,58,237,0.04) 100%)',
        borderColor: 'rgba(37,99,235,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--gradient-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(37,99,235,0.3)',
            }}>
              <Layers size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Bulk CSV Credential Issuance
              </h2>
              <p style={{ fontSize: 12, color: 'var(--accent-blue)', margin: '2px 0 0 0', fontWeight: 600 }}>
                Phase 5 · Supports 100+ records per upload · Sunbird RC Integration
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={downloadSampleCsv} style={{ fontSize: 12 }}>
              <Download size={13} /> Sample CSV
            </button>
            <button className="btn btn-secondary" onClick={loadJobHistory} disabled={loadingHistory} style={{ fontSize: 12 }}>
              <RefreshCw size={13} style={{ animation: loadingHistory ? 'spin 0.8s linear infinite' : 'none' }} />
              Refresh History
            </button>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '14px 0 0 0', maxWidth: 700, lineHeight: 1.7 }}>
          Upload a CSV file to issue W3C Verifiable Credentials at scale. Each row is individually validated,
          deduplicated against the database, and issued through Sunbird RC. Only confirmed issuances are
          stored — partial failures are safely reported without affecting successful records.
        </p>

        <WorkflowSteps />
      </div>

      {/* ── UPLOAD CARD ───────────────────────────────────────────────────── */}
      <div className="glass-card">
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Upload size={17} color="var(--accent-blue)" /> Configure & Upload
        </h3>

        <form onSubmit={handleSubmit}>
          {/* Schema selector */}
          <div className="form-group" style={{ maxWidth: 500 }}>
            <label className="form-label">Credential Schema / Certificate Template</label>
            <select
              className="select-field"
              value={selectedSchema}
              onChange={e => setSelectedSchema(e.target.value)}
              required
            >
              {schemas.length === 0 && <option value="">— Loading schemas... —</option>}
              {schemas.map(s => (
                <option key={s.id} value={s.id}>{s.schema_name} (v{s.version || '1.0'})</option>
              ))}
            </select>
          </div>

          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => !csvFile && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--accent-blue)' : csvFile ? 'var(--accent-emerald)' : '#cbd5e1'}`,
              borderRadius: 12,
              padding: '32px 24px',
              textAlign: 'center',
              background: dragActive ? 'rgba(37,99,235,0.04)' : csvFile ? 'rgba(5,150,105,0.03)' : '#fafbfc',
              cursor: csvFile ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
              marginBottom: 20,
            }}
          >
            {csvFile ? (
              /* Selected file display */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileSpreadsheet size={22} color="var(--accent-emerald)" />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: 14 }}>{csvFile.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(csvFile.size / 1024).toFixed(1)} KB
                    {csvPreview && ` · ${csvPreview.rows.length} data rows detected · ${csvPreview.headers.length} columns`}
                  </div>
                </div>
                <button
                  type="button" onClick={clearFile}
                  style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: 6, color: '#dc2626', cursor: 'pointer', padding: '3px 8px',
                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <X size={11} /> Remove
                </button>
              </div>
            ) : (
              /* Empty drop zone */
              <>
                <div style={{
                  width: 52, height: 52, borderRadius: 12, margin: '0 auto 12px auto',
                  background: dragActive ? 'rgba(37,99,235,0.1)' : '#f1f5f9',
                  border: `1px solid ${dragActive ? 'rgba(37,99,235,0.3)' : '#e2e8f0'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  <Upload size={22} color={dragActive ? 'var(--accent-blue)' : 'var(--text-muted)'} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {dragActive ? 'Release to upload' : 'Drag & drop your CSV file here'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  or click to browse · Max 10 MB · Up to 1,000 records per upload
                </div>
                {/* Required column chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {['recipient_name ✦required', 'recipient_identifier ✦required', 'gpa', 'specialization', 'experience_years', '...custom fields'].map(f => (
                    <span key={f} style={{
                      padding: '2px 10px', borderRadius: 6, fontSize: 10,
                      background: f.includes('required') ? 'rgba(37,99,235,0.06)' : '#f1f5f9',
                      border: `1px solid ${f.includes('required') ? 'rgba(37,99,235,0.2)' : '#e2e8f0'}`,
                      color: f.includes('required') ? 'var(--accent-blue)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: f.includes('required') ? 700 : 400,
                    }}>{f.replace(' ✦required', '')}{f.includes('required') && <span style={{ color: '#dc2626' }}> *</span>}</span>
                  ))}
                </div>
              </>
            )}
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
          </div>

          {/* Parse error */}
          {parseError && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.25)',
              color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {parseError}
            </div>
          )}

          {/* CSV preview table */}
          {csvPreview && !parseError && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={12} /> Preview — first {Math.min(5, csvPreview.rows.length)} of {csvPreview.rows.length} rows
                {csvPreview.rows.length > 100 && (
                  <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 8 }}>
                    ⚠ Large file: {csvPreview.rows.length} rows detected
                  </span>
                )}
              </div>
              <CsvPreviewTable headers={csvPreview.headers} rows={csvPreview.rows} />
            </div>
          )}

          {/* Upload progress */}
          {isSubmitting && (
            <div style={{ marginBottom: 20 }}>
              <ProgressBar current={uploadProgress} total={100} />
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 16,
              background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.25)',
              color: '#dc2626', fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <XCircle size={15} /> Upload Failed
              </div>
              {submitError}
            </div>
          )}

          {/* Submit button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !csvFile || !selectedSchema}
              style={{ padding: '12px 28px', fontSize: 14, fontWeight: 700 }}
            >
              {isSubmitting
                ? <><RefreshCw size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing Batch...</>
                : <><Zap size={15} /> Issue All Valid Credentials</>}
            </button>
            {csvFile && !isSubmitting && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {csvPreview ? `${csvPreview.rows.length} rows in file` : 'File ready'}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── JOB RESULTS ───────────────────────────────────────────────────── */}
      {jobResult && (
        <div ref={resultsRef} style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'slideUp 0.35s ease' }}>

          {/* Summary header card */}
          <div className="glass-card" style={{
            borderColor: jobResult.status === 'COMPLETED'
              ? 'rgba(5,150,105,0.35)'
              : jobResult.status === 'FAILED'
              ? 'rgba(220,38,38,0.35)'
              : 'rgba(217,119,6,0.35)',
          }}>
            {/* Job status banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {jobMeta && (
                  <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: `${jobMeta.color}15`,
                    border: `1px solid ${jobMeta.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <jobMeta.icon size={20} color={jobMeta.color} />
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Bulk Job — {jobMeta?.label}
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    Job ID: {jobResult.id}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {jobResult.records?.length > 0 && (
                  <button className="btn btn-secondary" onClick={downloadResultsCsv} style={{ fontSize: 12 }}>
                    <Download size={13} /> Export Results CSV
                  </button>
                )}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: `${jobMeta?.color}12`, color: jobMeta?.color,
                  border: `1px solid ${jobMeta?.color}30`,
                }}>
                  {jobMeta && <jobMeta.icon size={12} />} {jobResult.status}
                </span>
              </div>
            </div>

            {/* File-level validation errors */}
            {jobResult.validation_errors?.file_errors?.length > 0 && (
              <div style={{
                padding: '12px 16px', borderRadius: 10, marginBottom: 20,
                background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.25)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700, marginBottom: 8 }}>
                  <XCircle size={15} /> File Validation Errors
                </div>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {jobResult.validation_errors.file_errors.map((e, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#dc2626', lineHeight: 1.6 }}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stat cards row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard icon={BarChart2}    value={jobResult.total_records}      label="Total Rows"  color="#64748b" />
              <StatCard icon={CheckCircle}  value={jobResult.successful_records} label="Issued"      color="#059669" sublabel="Confirmed in Sunbird RC" />
              <StatCard icon={XCircle}      value={jobResult.failed_records}     label="Failed"      color="#dc2626" sublabel="Issuance errors" />
              <StatCard icon={Copy}         value={jobResult.duplicate_records}  label="Duplicates"  color="#d97706" sublabel="Skipped safely" />
            </div>

            {/* Meta info */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              <span><strong style={{ color: 'var(--text-secondary)' }}>File:</strong> {jobResult.filename}</span>
              {currentSchema && <span><strong style={{ color: 'var(--text-secondary)' }}>Schema:</strong> {currentSchema.schema_name}</span>}
              {jobResult.completed_at && (
                <span><strong style={{ color: 'var(--text-secondary)' }}>Completed:</strong> {new Date(jobResult.completed_at).toLocaleString()}</span>
              )}
            </div>
          </div>

          {/* Per-row records table */}
          {allRecords.length > 0 && (
            <div className="glass-card">
              {/* Table header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileSpreadsheet size={17} color="var(--accent-blue)" />
                  Per-Row Issuance Results
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                    ({filteredRecords.length} of {allRecords.length} shown)
                  </span>
                </h3>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search name or email..."
                    style={{
                      paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                      border: '1px solid #e2e8f0', borderRadius: 8,
                      background: '#f8fafc', color: 'var(--text-primary)',
                      fontSize: 12, outline: 'none', width: 220,
                      fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {[
                  { key: 'ALL',       color: '#475569' },
                  { key: 'ISSUED',    color: '#059669' },
                  { key: 'FAILED',    color: '#dc2626' },
                  { key: 'DUPLICATE', color: '#d97706' },
                  { key: 'INVALID',   color: '#ef4444' },
                ].map(f => {
                  const cnt = filterCounts[f.key];
                  if (f.key !== 'ALL' && cnt === 0) return null;
                  const active = activeFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setActiveFilter(f.key)}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${active ? f.color + '50' : '#e2e8f0'}`,
                        background: active ? `${f.color}0f` : '#f8fafc',
                        color: active ? f.color : 'var(--text-muted)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {f.key === 'ALL' ? 'All' : f.key.charAt(0) + f.key.slice(1).toLowerCase()} ({cnt})
                    </button>
                  );
                })}
              </div>

              {/* Records table */}
              <div style={{ overflow: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <table className="data-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Recipient Name</th>
                      <th>Email / Identifier</th>
                      <th>Status</th>
                      <th>Sunbird OSID</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.map((rec, i) => {
                      const cfg = STATUS_CFG[rec.status] || STATUS_CFG.PENDING;
                      const isExpanded = expandedRow === (rec.id || i);
                      const hasDetail = rec.error_message || rec.raw_row_data || rec.sunbird_osid;
                      return (
                        <React.Fragment key={rec.id || i}>
                          <tr style={{
                            background: rec.status !== 'ISSUED' ? cfg.bg : 'transparent',
                          }}>
                            <td style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 12, width: 48 }}>
                              {rec.row_number}
                            </td>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {rec.recipient_name || '—'}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                              {rec.recipient_identifier || '—'}
                            </td>
                            <td><StatusBadge status={rec.status} /></td>
                            <td>
                              {rec.sunbird_osid ? (
                                <code style={{ fontSize: 10, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', background: 'rgba(2,132,199,0.08)', padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(2,132,199,0.15)' }}>
                                  {rec.sunbird_osid}
                                </code>
                              ) : '—'}
                            </td>
                            <td>
                              {hasDetail && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedRow(isExpanded ? null : (rec.id || i))}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                                >
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  {rec.error_message ? 'Error' : 'View'}
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Expanded row detail */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} style={{ background: 'rgba(37,99,235,0.02)', padding: '12px 20px', borderBottom: '1px solid #f1f5f9' }}>
                                {rec.error_message && (
                                  <div style={{
                                    padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                                    background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.2)',
                                    color: '#dc2626', fontSize: 12, fontFamily: 'var(--font-mono)',
                                  }}>
                                    <strong>Error:</strong> {rec.error_message}
                                  </div>
                                )}
                                {rec.raw_row_data && (
                                  <div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      Raw Row Data
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {Object.entries(rec.raw_row_data).map(([k, v]) => (
                                        <div key={k} style={{
                                          padding: '3px 10px', borderRadius: 6, fontSize: 11,
                                          background: '#f8fafc', border: '1px solid #e2e8f0',
                                        }}>
                                          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{k}:</span>{' '}
                                          <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{String(v)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {rec.status === 'ISSUED' && rec.sunbird_osid && (
                                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Shield size={13} />
                                    Credential issued and stored. OSID:{' '}
                                    <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{rec.sunbird_osid}</code>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                          No records match the current filter or search query.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Error summary accordion */}
              {jobResult.error_summary?.errors?.length > 0 && (
                <details style={{ marginTop: 20 }}>
                  <summary style={{
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                    padding: '10px 0', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 6,
                    listStyle: 'none',
                  }}>
                    <AlertTriangle size={14} color="#d97706" />
                    Error Summary — {jobResult.error_summary.total_errors} issues detected
                  </summary>
                  <div style={{
                    marginTop: 12, padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(217,119,6,0.04)', border: '1px solid rgba(217,119,6,0.2)',
                    maxHeight: 240, overflow: 'auto',
                  }}>
                    {jobResult.error_summary.errors.map((e, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: 'var(--text-secondary)',
                        padding: '5px 0',
                        borderBottom: i < jobResult.error_summary.errors.length - 1 ? '1px solid #f1f5f9' : 'none',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                      }}>
                        <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>Row {e.row}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{e.recipient}</span>
                        <span style={{ color: '#dc2626' }}>— {e.errors?.join('; ')}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── JOB HISTORY TABLE ─────────────────────────────────────────────── */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={17} color="var(--accent-blue)" /> Recent Bulk Jobs
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {jobHistory.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{jobHistory.length} job{jobHistory.length !== 1 ? 's' : ''}</span>
            )}
            <button className="btn btn-secondary" onClick={loadJobHistory} disabled={loadingHistory} style={{ fontSize: 12 }}>
              <RefreshCw size={13} style={{ animation: loadingHistory ? 'spin 0.8s linear infinite' : 'none' }} />
              {loadingHistory ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {jobHistory.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 24px',
            border: '2px dashed #e2e8f0', borderRadius: 10,
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            <Layers size={28} color="#cbd5e1" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {loadingHistory ? 'Loading job history...' : 'No bulk jobs yet'}
            </div>
            {!loadingHistory && <div>Upload a CSV file above to issue your first batch of credentials.</div>}
          </div>
        ) : (
          <div style={{ overflow: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <table className="data-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issued</th>
                  <th>Failed</th>
                  <th>Duplicates</th>
                  <th>Started At</th>
                </tr>
              </thead>
              <tbody>
                {jobHistory.map(job => {
                  const sm = JOB_STATUS_META[job.status] || JOB_STATUS_META.COMPLETED;
                  const SmIcon = sm.icon;
                  return (
                    <tr
                      key={job.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setJobResult(job); setActiveFilter('ALL'); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                      title="Click to view results"
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <FileSpreadsheet size={14} color="var(--accent-blue)" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{job.filename}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: sm.color }}>
                          <SmIcon size={13} /> {sm.label}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{job.total_records}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>{job.successful_records}</td>
                      <td style={{ fontWeight: 700, color: '#dc2626' }}>{job.failed_records}</td>
                      <td style={{ fontWeight: 700, color: '#d97706' }}>{job.duplicate_records}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
