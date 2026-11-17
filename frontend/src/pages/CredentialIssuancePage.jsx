import React, { useState, useEffect, useCallback } from 'react';
import { credentialsApi } from '../services/api';
import {
  Award, Plus, User, Mail, ChevronDown, AlertTriangle,
  CheckCircle2, RefreshCw, X, Shield, Hash, FileText,
  Sparkles, ArrowRight, Info
} from 'lucide-react';

function LoadingSpinner({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', fontSize: '13px' }}>
      <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(37,99,235,0.2)', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
      {label}
    </div>
  );
}

export default function CredentialIssuancePage({ currentUser }) {
  const [schemas, setSchemas] = useState([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [schemasError, setSchemasError] = useState('');

  const [selectedSchemaId, setSelectedSchemaId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [credentialData, setCredentialData] = useState({});
  const [dynamicFields, setDynamicFields] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successResult, setSuccessResult] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const userRole = currentUser?.role || 'ADMIN';
  const canIssue = ['ADMIN', 'ISSUER'].includes(userRole);

  const loadSchemas = useCallback(async () => {
    setSchemasLoading(true);
    setSchemasError('');
    try {
      const data = await credentialsApi.getSchemas();
      setSchemas(Array.isArray(data) ? data : []);
    } catch (err) {
      setSchemasError('Failed to load credential schemas.');
    } finally {
      setSchemasLoading(false);
    }
  }, []);

  useEffect(() => { loadSchemas(); }, [loadSchemas]);

  useEffect(() => {
    if (!selectedSchemaId) { setDynamicFields([]); setCredentialData({}); return; }
    const schema = schemas.find(s => s.id === selectedSchemaId);
    if (!schema) return;

    // Derive dynamic fields from json_schema or fields array
    let fields = [];
    if (schema.json_schema?.properties) {
      fields = Object.entries(schema.json_schema.properties)
        .filter(([k]) => !['recipient_name', 'recipient_identifier', 'recipient_email'].includes(k))
        .map(([k, v]) => ({
          key: k,
          label: v.title || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: v.type === 'number' || v.type === 'integer' ? 'number' : 'text',
          required: schema.json_schema.required?.includes(k) || false,
          description: v.description || ''
        }));
    } else if (Array.isArray(schema.fields)) {
      fields = schema.fields
        .filter(f => !['recipient_name', 'recipient_email', 'recipient_identifier'].includes(f))
        .map(f => ({
          key: f,
          label: f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: f.includes('gpa') || f.includes('score') || f.includes('year') ? 'number' : 'text',
          required: false,
          description: ''
        }));
    }
    setDynamicFields(fields);
    setCredentialData({});
  }, [selectedSchemaId, schemas]);

  const validate = () => {
    const errs = {};
    if (!recipientName.trim()) errs.recipientName = 'Recipient full name is required.';
    if (!recipientEmail.trim()) errs.recipientEmail = 'Recipient email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) errs.recipientEmail = 'Invalid email address format.';
    if (!selectedSchemaId) errs.schemaId = 'Please select a credential schema.';
    dynamicFields.filter(f => f.required).forEach(f => {
      if (!credentialData[f.key]?.toString().trim()) errs[f.key] = `${f.label} is required.`;
    });
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError('');
    setSuccessResult(null);

    const payload = {
      schema_id: selectedSchemaId,
      recipient_identifier: recipientEmail.trim(),
      recipient_name: recipientName.trim(),
      credential_data: credentialData
    };

    try {
      const result = await credentialsApi.issueCredential(payload);
      setSuccessResult(result);
      // Reset form
      setRecipientName('');
      setRecipientEmail('');
      setSelectedSchemaId('');
      setCredentialData({});
      setDynamicFields([]);
      setValidationErrors({});
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setSubmitError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Credential issuance failed. Please check inputs and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (key, value) => {
    setCredentialData(prev => ({ ...prev, [key]: value }));
    if (validationErrors[key]) setValidationErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const selectedSchema = schemas.find(s => s.id === selectedSchemaId);

  if (!canIssue) {
    return (
      <div className="glass-card" style={{ maxWidth: '560px', margin: '40px auto', padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(220,38,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Shield size={28} color="#dc2626" />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Your role <strong>{userRole}</strong> is not authorized to issue credentials. Only <strong>ISSUER</strong> and <strong>ADMIN</strong> roles can perform this operation.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '860px', margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Page intro */}
      <div className="glass-card" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(124,58,237,0.05) 100%)', border: '1px solid rgba(37,99,235,0.15)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(37,99,235,0.3)' }}>
          <Plus size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Issue New Verifiable Credential</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.6 }}>
            Select a registered schema, fill recipient details, and submit to generate a W3C-compliant credential via the Sunbird RC registry.
            All fields are validated against the schema before issuance.
          </p>
        </div>
      </div>

      {/* Success Banner */}
      {successResult && (
        <div style={{ padding: '20px 24px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: '14px', animation: 'slideIn 0.3s ease', display: 'flex', gap: '16px' }}>
          <CheckCircle2 size={24} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#059669', marginBottom: '8px' }}>Credential Issued Successfully!</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { label: 'Sunbird OSID', value: successResult.sunbird_osid, mono: true },
                { label: 'Status', value: successResult.status || 'ISSUED' },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#047857', fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setSuccessResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', alignSelf: 'flex-start' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {submitError && (
        <div style={{ padding: '14px 16px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px', color: '#dc2626', fontSize: '13px', display: 'flex', alignItems: 'flex-start', gap: '10px', animation: 'slideIn 0.2s ease' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ flex: 1 }}>{submitError}</div>
          <button onClick={() => setSubmitError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={15} /></button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Schema Selection */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#2563eb" /> Step 1 — Select Credential Schema
            </h3>

            {schemasLoading ? (
              <LoadingSpinner label="Loading registered schemas..." />
            ) : schemasError ? (
              <div style={{ color: '#dc2626', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <AlertTriangle size={14} /> {schemasError}
                <button type="button" onClick={loadSchemas} className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }}>Retry</button>
              </div>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Credential Schema *</label>
                  <select
                    className="select-field"
                    value={selectedSchemaId}
                    onChange={e => { setSelectedSchemaId(e.target.value); setValidationErrors(p => { const n = { ...p }; delete n.schemaId; return n; }); }}
                  >
                    <option value="">— Select a registered schema —</option>
                    {schemas.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.schema_name} {s.version ? `v${s.version}` : ''}
                      </option>
                    ))}
                  </select>
                  {validationErrors.schemaId && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{validationErrors.schemaId}</div>}
                </div>

                {selectedSchema && (
                  <div style={{ marginTop: '12px', padding: '12px 14px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: '10px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '10px', animation: 'fadeIn 0.25s ease' }}>
                    <Info size={14} color="#2563eb" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{selectedSchema.schema_name}</strong>
                      {selectedSchema.description && <> — {selectedSchema.description}</>}
                      {selectedSchema.issuer_name && <div style={{ marginTop: '3px' }}>Issuer: {selectedSchema.issuer_name}</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Recipient Information */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#2563eb" /> Step 2 — Recipient Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="input-field"
                    style={{ paddingLeft: '36px', borderColor: validationErrors.recipientName ? '#dc2626' : undefined }}
                    placeholder="e.g. Alice Johnson"
                    value={recipientName}
                    onChange={e => { setRecipientName(e.target.value); if (validationErrors.recipientName) setValidationErrors(p => { const n = { ...p }; delete n.recipientName; return n; }); }}
                  />
                </div>
                {validationErrors.recipientName && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{validationErrors.recipientName}</div>}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email Address *</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    className="input-field"
                    style={{ paddingLeft: '36px', borderColor: validationErrors.recipientEmail ? '#dc2626' : undefined }}
                    placeholder="recipient@organization.com"
                    value={recipientEmail}
                    onChange={e => { setRecipientEmail(e.target.value); if (validationErrors.recipientEmail) setValidationErrors(p => { const n = { ...p }; delete n.recipientEmail; return n; }); }}
                  />
                </div>
                {validationErrors.recipientEmail && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{validationErrors.recipientEmail}</div>}
              </div>
            </div>
          </div>

          {/* Dynamic Schema Fields */}
          {selectedSchemaId && dynamicFields.length > 0 && (
            <div className="glass-card" style={{ padding: '24px', animation: 'fadeIn 0.3s ease' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#7c3aed" /> Step 3 — Credential Data Fields
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {dynamicFields.map(field => (
                  <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">
                      {field.label}
                      {field.required && <span style={{ color: '#dc2626', marginLeft: '3px' }}>*</span>}
                    </label>
                    <input
                      type={field.type}
                      className="input-field"
                      placeholder={field.description || `Enter ${field.label.toLowerCase()}`}
                      style={{ borderColor: validationErrors[field.key] ? '#dc2626' : undefined }}
                      value={credentialData[field.key] || ''}
                      onChange={e => handleFieldChange(field.key, field.type === 'number' ? parseFloat(e.target.value) || e.target.value : e.target.value)}
                    />
                    {validationErrors[field.key] && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{validationErrors[field.key]}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(37,99,235,0.03), rgba(124,58,237,0.03))' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <Shield size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              Credential will be cryptographically signed and stored in Sunbird RC registry.
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '12px 28px', fontSize: '14px', minWidth: '180px' }}
              disabled={submitting || !selectedSchemaId}
            >
              {submitting
                ? <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Issuing Credential...</>
                : <><Award size={15} /> Issue Credential <ArrowRight size={14} /></>
              }
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
