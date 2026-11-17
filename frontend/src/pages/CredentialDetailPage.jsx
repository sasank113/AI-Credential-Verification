import React, { useState } from 'react';
import { credentialsApi } from '../services/api';
import {
  X, Shield, CheckCircle2, XCircle, Clock, AlertTriangle, Copy,
  User, Mail, Calendar, Hash, Award, ExternalLink, ChevronDown,
  ChevronUp, FileCode, RefreshCw, ShieldCheck, ShieldOff
} from 'lucide-react';

const STATUS_COLORS = {
  ISSUED: { bg: 'rgba(5,150,105,0.1)', color: '#059669', border: 'rgba(5,150,105,0.25)', label: 'Active & Issued' },
  REVOKED: { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', border: 'rgba(220,38,38,0.25)', label: 'Revoked' },
  PENDING_AI: { bg: 'rgba(217,119,6,0.1)', color: '#d97706', border: 'rgba(217,119,6,0.25)', label: 'Pending AI Review' },
  FAILED: { bg: 'rgba(100,116,139,0.1)', color: '#64748b', border: 'rgba(100,116,139,0.25)', label: 'Failed' },
};

function MetaRow({ icon: Icon, label, value, mono }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(String(value || ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
        <Icon size={14} color="#2563eb" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {value || '—'}
          {value && mono && (
            <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#059669' : 'var(--text-muted)', padding: '2px', flexShrink: 0 }} title="Copy">
              {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CredentialDetailPage({ credential, currentUser, onClose, onRevoke }) {
  const [showPayload, setShowPayload] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  if (!credential) return null;

  const userRole = currentUser?.role || 'ADMIN';
  const canRevoke = ['ADMIN', 'ISSUER'].includes(userRole);
  const s = STATUS_COLORS[credential.status] || STATUS_COLORS.FAILED;

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'medium' });
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError('');
    try {
      const payload = credential.credential_payload;
      const osid = credential.sunbird_osid;
      const res = await credentialsApi.verifyCredential(payload || { sunbird_osid: osid });
      setVerifyResult(res);
    } catch (err) {
      setVerifyError(err?.response?.data?.detail || 'Verification request failed.');
    } finally {
      setVerifying(false);
    }
  };

  const subject = credential.credential_payload?.credentialSubject || {};
  const proof = credential.credential_payload?.proof || {};

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '20px'
    }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '720px', maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s ease'
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 10, display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(37,99,235,0.3)' }}>
            <Award size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Credential Details</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {credential.schema_name || credential.schema_id || 'Verifiable Credential'}
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {credential.status === 'ISSUED' ? <CheckCircle2 size={12} /> : credential.status === 'REVOKED' ? <XCircle size={12} /> : <Clock size={12} />}
            {s.label}
          </span>
          <button onClick={onClose} style={{ background: 'rgba(100,116,139,0.1)', border: 'none', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Revocation Notice */}
          {credential.status === 'REVOKED' && (
            <div style={{ padding: '14px 16px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Credential Revoked</div>
                <div style={{ fontSize: '12px', color: '#991b1b' }}>
                  Reason: <strong>{credential.revocation_reason || 'No reason provided.'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Identity & Metadata */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Recipient & Identity</h3>
            <MetaRow icon={User} label="Recipient Name" value={credential.recipient_name} />
            <MetaRow icon={Mail} label="Recipient Identifier" value={credential.recipient_identifier} />
            <MetaRow icon={Award} label="Credential Type / Schema" value={credential.schema_name || credential.schema_id} />
            <MetaRow icon={Hash} label="Sunbird OSID" value={credential.sunbird_osid} mono />
            <MetaRow icon={Hash} label="Internal DB ID" value={credential.id} mono />
            <MetaRow icon={Calendar} label="Issue Date" value={formatDate(credential.issue_date || credential.issued_at)} />
            {credential.issued_by && <MetaRow icon={User} label="Issued By (User ID)" value={credential.issued_by} mono />}
          </div>

          {/* Credential Subject from VC Payload */}
          {Object.keys(subject).length > 0 && (
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Credential Subject</h3>
              {Object.entries(subject).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: '16px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Proof / Signature */}
          {Object.keys(proof).length > 0 && (
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Cryptographic Proof</h3>
              {Object.entries(proof).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', gap: '16px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right', wordBreak: 'break-all', maxWidth: '380px' }}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Verification Panel */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live Verification</h3>
              <button
                className="btn btn-primary"
                style={{ fontSize: '12px', padding: '8px 16px' }}
                onClick={handleVerify}
                disabled={verifying}
              >
                {verifying
                  ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Verifying...</>
                  : <><ShieldCheck size={13} /> Verify Now</>
                }
              </button>
            </div>

            {verifyError && (
              <div style={{ padding: '12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#dc2626', fontSize: '13px', display: 'flex', gap: '8px' }}>
                <AlertTriangle size={15} /> {verifyError}
              </div>
            )}

            {verifyResult && (
              <div style={{
                padding: '16px', borderRadius: '12px',
                background: verifyResult.is_valid ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.08)',
                border: `1px solid ${verifyResult.is_valid ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.25)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  {verifyResult.is_valid
                    ? <ShieldCheck size={20} color="#059669" />
                    : <ShieldOff size={20} color="#dc2626" />
                  }
                  <span style={{ fontSize: '14px', fontWeight: 700, color: verifyResult.is_valid ? '#059669' : '#dc2626' }}>
                    {verifyResult.is_valid ? 'Credential Verified & Valid' : 'Verification Failed'}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: verifyResult.is_valid ? '#047857' : '#991b1b', lineHeight: 1.6 }}>
                  {verifyResult.message}
                </p>
                {verifyResult.verification_details && Object.keys(verifyResult.verification_details).length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.entries(verifyResult.verification_details).map(([k, v]) => (
                      <div key={k} style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {k.replace(/_/g, ' ')}: <strong style={{ color: 'var(--text-primary)' }}>{String(v)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!verifyResult && !verifyError && !verifying && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                Click &ldquo;Verify Now&rdquo; to check cryptographic proof and registry status in real time.
              </p>
            )}
          </div>

          {/* Raw VC Payload Toggle */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            <button
              onClick={() => setShowPayload(p => !p)}
              style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileCode size={16} color="#2563eb" />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Raw W3C VC Payload (JSON-LD)</span>
              </div>
              {showPayload ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showPayload && (
              <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px' }}>
                <pre className="code-block" style={{ fontSize: '12px', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '360px', overflowY: 'auto' }}>
                  {JSON.stringify(credential.credential_payload, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} className="btn btn-secondary">
              <X size={14} /> Close
            </button>
            {canRevoke && credential.status === 'ISSUED' && (
              <button
                className="btn btn-danger"
                onClick={() => { onClose(); onRevoke && onRevoke(credential); }}
              >
                <XCircle size={14} /> Revoke Credential
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
