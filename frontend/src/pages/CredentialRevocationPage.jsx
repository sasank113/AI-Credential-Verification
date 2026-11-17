import React, { useState } from 'react';
import { credentialsApi } from '../services/api';
import {
  XCircle, AlertTriangle, RefreshCw, X, Shield, Hash,
  CheckCircle2, Info, User, Award
} from 'lucide-react';

export default function CredentialRevocationPage({ currentUser, prefilledCredential, onRevoked, onClose }) {
  const [osid, setOsid] = useState(prefilledCredential?.sunbird_osid || prefilledCredential?.id || '');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const userRole = currentUser?.role || 'ADMIN';
  const canRevoke = ['ADMIN', 'ISSUER'].includes(userRole);

  const validate = () => {
    const errs = {};
    if (!osid.trim()) errs.osid = 'Sunbird OSID is required.';
    if (!reason.trim()) errs.reason = 'Revocation reason is required.';
    else if (reason.trim().length < 10) errs.reason = 'Please provide a more detailed reason (min. 10 characters).';
    if (!confirm) errs.confirm = 'You must confirm that this action is irreversible.';
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRevoke = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError('');
    setSuccess(null);
    try {
      const res = await credentialsApi.revokeCredential(osid.trim(), reason.trim());
      setSuccess(res);
      if (onRevoked) onRevoked({ osid: osid.trim(), reason: reason.trim() });
    } catch (err) {
      setError(err?.response?.data?.detail || 'Revocation failed. The credential may not exist or is already revoked.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (!prefilledCredential) { setOsid(''); }
    setReason('');
    setConfirm(false);
    setSuccess(null);
    setError('');
    setValidationErrors({});
  };

  if (!canRevoke) {
    return (
      <div className="glass-card" style={{ maxWidth: '560px', margin: '40px auto', padding: '40px', textAlign: 'center' }}>
        <Shield size={40} color="#dc2626" style={{ marginBottom: '16px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Access Restricted</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Your role <strong>{userRole}</strong> is not authorized to revoke credentials. Only <strong>ISSUER</strong> and <strong>ADMIN</strong> roles can perform revocation.
        </p>
      </div>
    );
  }

  const isModal = !!onClose;

  const Content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px', margin: isModal ? '0' : '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Warning Banner */}
      <div style={{ padding: '16px 18px', background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Irreversible Operation Warning</div>
          <div style={{ fontSize: '12px', color: '#991b1b', lineHeight: 1.6 }}>
            Revoking a credential permanently marks it as invalid in the Sunbird RC registry. The credential cannot be un-revoked.
            All future verification attempts on this credential will return a <strong>REVOKED</strong> status.
          </div>
        </div>
      </div>

      {/* Prefilled Credential Info */}
      {prefilledCredential && (
        <div style={{ padding: '14px 16px', background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: '10px', display: 'flex', gap: '12px', animation: 'slideIn 0.2s ease' }}>
          <Award size={16} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{prefilledCredential.schema_name || prefilledCredential.schema_id}</div>
            <div><strong>Recipient:</strong> {prefilledCredential.recipient_name} ({prefilledCredential.recipient_identifier})</div>
            <div style={{ marginTop: '2px' }}><strong>OSID:</strong> <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{prefilledCredential.sunbird_osid || prefilledCredential.id}</code></div>
          </div>
        </div>
      )}

      {/* Success */}
      {success && (
        <div style={{ padding: '18px 20px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: '12px', animation: 'slideIn 0.3s ease', display: 'flex', gap: '12px' }}>
          <CheckCircle2 size={22} color="#059669" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>Credential Revoked Successfully</div>
            <div style={{ fontSize: '13px', color: '#047857' }}>{success.message || `Credential has been permanently revoked in the Sunbird RC registry.`}</div>
          </div>
          {isModal && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669' }}>
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#dc2626', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'center', animation: 'slideIn 0.2s ease' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
        </div>
      )}

      {!success && (
        <form onSubmit={handleRevoke} noValidate>
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* OSID Input */}
            {!prefilledCredential && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sunbird OSID *</label>
                <div style={{ position: 'relative' }}>
                  <Hash size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="input-field"
                    style={{ paddingLeft: '36px', fontFamily: 'var(--font-mono)', fontSize: '13px', borderColor: validationErrors.osid ? '#dc2626' : undefined }}
                    placeholder="e.g. osid-sb-demo-001"
                    value={osid}
                    onChange={e => { setOsid(e.target.value); if (validationErrors.osid) setValidationErrors(p => { const n = { ...p }; delete n.osid; return n; }); }}
                  />
                </div>
                {validationErrors.osid && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>{validationErrors.osid}</div>}
              </div>
            )}

            {/* Reason */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Revocation Reason *</label>
              <textarea
                className="textarea-field"
                rows={3}
                placeholder="Provide a detailed reason for revocation, e.g. 'Employee no longer with organization as of Oct 2026.'"
                value={reason}
                onChange={e => { setReason(e.target.value); if (validationErrors.reason) setValidationErrors(p => { const n = { ...p }; delete n.reason; return n; }); }}
                style={{ borderColor: validationErrors.reason ? '#dc2626' : undefined }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                {validationErrors.reason
                  ? <div style={{ color: '#dc2626', fontSize: '12px' }}>{validationErrors.reason}</div>
                  : <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Minimum 10 characters. This reason is stored permanently in the audit trail.</div>
                }
                <div style={{ fontSize: '11px', color: reason.length < 10 ? '#dc2626' : 'var(--text-muted)', fontWeight: 600 }}>{reason.length}/10+</div>
              </div>
            </div>

            {/* Preset reasons */}
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>Quick select reason:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  'Employee no longer with organization',
                  'Credential issued in error',
                  'Data inconsistency identified',
                  'Administrative policy update',
                  'Duplicate credential superseded',
                ].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setReason(r); if (validationErrors.reason) setValidationErrors(p => { const n = { ...p }; delete n.reason; return n; }); }}
                    style={{
                      padding: '5px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '6px',
                      background: reason === r ? 'rgba(220,38,38,0.1)' : '#f8fafc',
                      border: reason === r ? '1px solid rgba(220,38,38,0.3)' : '1px solid var(--border-color)',
                      color: reason === r ? '#dc2626' : 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirmation checkbox */}
            <div style={{ padding: '12px 14px', background: '#fef2f2', border: `1px solid ${validationErrors.confirm ? '#dc2626' : '#fecaca'}`, borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                id="revoke-confirm"
                checked={confirm}
                onChange={e => { setConfirm(e.target.checked); if (validationErrors.confirm) setValidationErrors(p => { const n = { ...p }; delete n.confirm; return n; }); }}
                style={{ marginTop: '3px', accentColor: '#dc2626', cursor: 'pointer', flexShrink: 0 }}
              />
              <label htmlFor="revoke-confirm" style={{ fontSize: '12px', color: '#991b1b', cursor: 'pointer', lineHeight: 1.6, fontWeight: 500 }}>
                I confirm that revoking this credential is intentional and I understand this action is <strong>permanent and cannot be undone</strong>.
              </label>
            </div>
            {validationErrors.confirm && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '-8px' }}>{validationErrors.confirm}</div>}
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            {isModal && (
              <button type="button" onClick={onClose} className="btn btn-secondary">
                <X size={14} /> Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary"
              style={{ fontSize: '13px' }}
            >
              Reset
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              style={{ padding: '12px 28px', fontSize: '14px' }}
              disabled={loading}
            >
              {loading
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Revoking...</>
                : <><XCircle size={15} /> Revoke Credential</>
              }
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px'
      }}>
        <div style={{
          background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '680px',
          maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.2)',
          animation: 'slideIn 0.3s ease'
        }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--gradient-rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(220,38,38,0.3)' }}>
                <XCircle size={20} color="#fff" />
              </div>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Revoke Credential</h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Permanently invalidate in Sunbird RC registry</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(100,116,139,0.1)', border: 'none', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: '24px 28px' }}>{Content}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-card" style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--gradient-rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(220,38,38,0.3)' }}>
          <XCircle size={22} color="#fff" />
        </div>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Credential Revocation</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.6 }}>
            Permanently revoke an issued credential from the Sunbird RC registry. Provide the OSID and a detailed reason.
            This action creates an immutable audit trail and cannot be undone.
          </p>
        </div>
      </div>
      {Content}
    </div>
  );
}
