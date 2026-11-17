import React, { useState, useEffect } from 'react';
import { credentialsApi, aiApi } from '../services/api';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, Search, Trash2, RefreshCw, FileText, Award, Stamp, FileCheck, Layers } from 'lucide-react';

export default function VerificationPage() {
  const [issuedCredentials, setIssuedCredentials] = useState([]);
  const [selectedOsid, setSelectedOsid] = useState('');

  const [jsonInput, setJsonInput] = useState(`{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "id": "urn:uuid:osid-sb-demo-001",
  "type": ["VerifiableCredential", "AI & Data Science Professional Certificate"],
  "issuer": "did:sunbirdrc:ai-institute-01",
  "credentialSubject": {
    "sunbird_osid": "osid-sb-demo-001",
    "recipient_name": "Eleanor Vance",
    "recipient_email": "eleanor@enterprise.com",
    "certificate_title": "AI & Data Science Professional Certificate",
    "gpa": 3.9
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-09-25T12:00:00Z",
    "verificationMethod": "did:sunbirdrc:ai-institute-01#key-1",
    "proofPurpose": "assertionMethod",
    "jws": "eyJhbGciOiJFZERTQSI...demo_signature_proof_valid"
  }
}`);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [fraudResult, setFraudResult] = useState(null);

  // Revocation state
  const [revokeOsid, setRevokeOsid] = useState('osid-sb-demo-001');
  const [revokeReason, setRevokeReason] = useState('Certificate issued in error - administrative revocation');
  const [revokeStatus, setRevokeStatus] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const [sunbirdStatus, setSunbirdStatus] = useState(null);
  const [schemaValidationResult, setSchemaValidationResult] = useState(null);
  const [ocrCredentialId, setOcrCredentialId] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [editedStudentName, setEditedStudentName] = useState('');
  const [editedRegisterNumber, setEditedRegisterNumber] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');

  const loadCredentialsList = async () => {
    try {
      const list = await credentialsApi.getCredentials();
      setIssuedCredentials(list);
      const sbStatus = await credentialsApi.getSunbirdStatus();
      setSunbirdStatus(sbStatus);
    } catch (err) {
      console.error("Failed to load credentials list:", err);
    }
  };

  useEffect(() => {
    loadCredentialsList();
  }, []);

  const handleSelectCredentialToTest = (cred) => {
    setSelectedOsid(cred.sunbird_osid);
    setRevokeOsid(cred.sunbird_osid);
    if (cred.credential_payload) {
      setJsonInput(JSON.stringify(cred.credential_payload, null, 2));
    }
  };
  const handleCompareCertificate = async (e) => {
    e.preventDefault();

    if (!ocrCredentialId || !certificateFile) {
      setOcrError('Please select a credential and upload a certificate.');
      return;
    }

    setOcrLoading(true);
    setOcrError('');
    setOcrResult(null);

    try {
      const result = await credentialsApi.compareCertificate(
        ocrCredentialId,
        certificateFile,
        editedStudentName,
        editedRegisterNumber
      );

      setOcrResult(result);
    } catch (err) {
      setOcrError(
        err.response?.data?.detail ||
        err.message ||
        'Certificate comparison failed.'
      );
    } finally {
      setOcrLoading(false);
    }
  };
  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    setFraudResult(null);
    setSchemaValidationResult(null);
    try {
      const parsed = JSON.parse(jsonInput);

      // 1. Local W3C & JSON Schema Validator check
      const schemaRes = await credentialsApi.validateSchema(parsed);
      setSchemaValidationResult(schemaRes);

      // 2. Proof signature & revocation status check
      const verifyRes = await credentialsApi.verifyCredential(parsed);
      setVerifyResult(verifyRes);

      // 3. AI Fraud Scanner
      const fraudRes = await aiApi.detectFraud(parsed);
      setFraudResult(fraudRes);
    } catch (err) {
      alert("Invalid JSON format or verification endpoint error.");
    } finally {
      setVerifying(false);
    }
  };

  const handleRevoke = async (e) => {
    e.preventDefault();
    if (!revokeOsid || !revokeReason) return;
    setRevoking(true);
    setRevokeStatus(null);
    try {
      const res = await credentialsApi.revokeCredential(revokeOsid, revokeReason);
      setRevokeStatus({ success: true, message: res.message });
      await loadCredentialsList();
      // Re-trigger verify if currently verifying this OSID
      handleVerify();
    } catch (err) {
      setRevokeStatus({ success: false, message: err.response?.data?.detail || "Revocation failed" });
    } finally {
      setRevoking(false);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Sunbird RC Registry Live Engine Status Bar */}
      {sunbirdStatus && (
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.05) 0%, rgba(99, 102, 241, 0.05) 100%)', border: '1px solid rgba(2, 132, 199, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ height: '10px', width: '10px', borderRadius: '50%', background: sunbirdStatus.status === 'HEALTHY' ? '#10b981' : '#f59e0b', boxShadow: sunbirdStatus.status === 'HEALTHY' ? '0 0 10px #10b981' : '0 0 10px #f59e0b' }}></span>
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Sunbird RC Registry Connection: <span style={{ color: 'var(--accent-cyan)' }}>{sunbirdStatus.mode}</span>
              </h4>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Target Endpoint: {sunbirdStatus.base_url} | Latency: {sunbirdStatus.latency_ms} ms
              </span>
            </div>
          </div>
          <span className={`badge ${sunbirdStatus.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`}>
            {sunbirdStatus.status}
          </span>
        </div>
      )}

      {/* Quick Credentials Selector Toolbar */}
      {issuedCredentials.length > 0 && (
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="var(--accent-cyan)" /> Available Demo Credentials ({issuedCredentials.length})
            </h4>
            <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={loadCredentialsList}>
              <RefreshCw size={12} /> Refresh List
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {issuedCredentials.map((c) => (
              <button
                key={c.sunbird_osid}
                className="btn btn-secondary"
                style={{
                  fontSize: '12px',
                  borderColor: c.status === 'REVOKED' ? 'var(--accent-rose)' : selectedOsid === c.sunbird_osid ? 'var(--accent-cyan)' : 'var(--border-color)',
                  background: selectedOsid === c.sunbird_osid ? 'rgba(2, 132, 199, 0.1)' : '#f8fafc'
                }}
                onClick={() => handleSelectCredentialToTest(c)}
              >
                <span className={`badge ${c.status === 'REVOKED' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                  {c.status}
                </span>
                <span>{c.recipient_name} ({c.sunbird_osid})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Verifier Verification Input */}
        <div className="glass-card">
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="var(--accent-blue)" /> Signature Proof & Status Verifier
          </h3>

          <div className="form-group">
            <label className="form-label">Paste W3C Verifiable Credential JSON Payload</label>
            <textarea
              className="textarea-field"
              rows={12}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={handleVerify} disabled={verifying}>
            <Search size={16} /> {verifying ? 'Verifying Signature & Status...' : 'Verify Cryptographic Signature & AI Risk'}
          </button>
        </div>

        {/* Verification Output & Revocation Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {schemaValidationResult && (
            <div className="glass-card" style={{ borderColor: schemaValidationResult.is_valid ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {schemaValidationResult.is_valid ? <CheckCircle size={16} color="#059669" /> : <AlertTriangle size={16} color="#dc2626" />}
                  W3C & JSON Schema Validator: {schemaValidationResult.is_valid ? 'SCHEMA COMPLIANT' : 'SCHEMA ERRORS DETECTED'}
                </h4>
                <span className={`badge ${schemaValidationResult.is_valid ? 'badge-success' : 'badge-danger'}`}>
                  {schemaValidationResult.metadata?.total_errors || 0} Errors
                </span>
              </div>
              {schemaValidationResult.errors?.length > 0 ? (
                <ul style={{ paddingLeft: '18px', color: '#dc2626', fontSize: '12px', margin: 0 }}>
                  {schemaValidationResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '12px', color: '#059669', margin: 0 }}>
                  All required W3C VC structural keys (@context, id, type, issuer, issuanceDate, credentialSubject) & schema definitions are fully compliant.
                </p>
              )}
            </div>
          )}

          {verifyResult && (

            <div className="glass-card" style={{ borderColor: verifyResult.is_valid ? 'var(--accent-emerald)' : 'var(--accent-rose)', background: verifyResult.is_valid ? 'rgba(5, 150, 105, 0.05)' : 'rgba(220, 38, 38, 0.05)' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {verifyResult.is_valid ? <CheckCircle color="#059669" size={22} /> : <ShieldAlert color="#dc2626" size={22} />}
                Status Verification: {verifyResult.is_valid ? 'PASSED & ACTIVE' : 'FAILED / REVOKED'}
              </h4>
              <p style={{ fontSize: '13px', color: verifyResult.is_valid ? '#059669' : '#dc2626', fontWeight: 500 }}>
                {verifyResult.message}
              </p>
            </div>
          )}

          {fraudResult && (
            <div className="glass-card" style={{ borderColor: fraudResult.anomaly_detected ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={18} color="var(--accent-amber)" /> AI Credential Fraud & Anomaly Scan
                </h4>
                <span className={`badge ${fraudResult.risk_level === 'LOW' ? 'badge-success' : 'badge-danger'}`}>
                  Risk Level: {fraudResult.risk_level}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <strong>Confidence Score:</strong> {(fraudResult.confidence_score * 100).toFixed(0)}%
              </div>

              {fraudResult.detected_anomalies.length > 0 ? (
                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '12px', color: '#dc2626' }}>Detected Anomalies:</strong>
                  <ul style={{ paddingLeft: '20px', color: '#dc2626', fontSize: '13px' }}>
                    {fraudResult.detected_anomalies.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#059669', marginBottom: '12px' }}>
                  No structural, key, or revocation anomalies detected in payload.
                </div>
              )}

              <div style={{ fontSize: '12px', color: 'var(--accent-cyan)' }}>
                <strong>AI Recommendation:</strong> {fraudResult.recommendation}
              </div>
            </div>
          )}

          {/* Manual Revocation Engine */}
          <div className="glass-card" style={{ borderColor: 'rgba(220, 38, 38, 0.4)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={18} color="var(--accent-rose)" /> Manual Credential Revocation Panel
            </h3>

            <form onSubmit={handleRevoke}>
              <div className="form-group">
                <label className="form-label">Sunbird OSID to Revoke</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. osid-sb-demo-001"
                  value={revokeOsid}
                  onChange={(e) => setRevokeOsid(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Revocation Reason</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Fraudulent claims / Issued by administrative mistake"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-danger" disabled={revoking}>
                <Trash2 size={16} /> {revoking ? 'Executing Revocation...' : 'Execute Manual Revocation'}
              </button>
            </form>

            {revokeStatus && (
              <div style={{ marginTop: '14px', padding: '12px', borderRadius: 'var(--radius-md)', background: revokeStatus.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)', border: `1px solid ${revokeStatus.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`, fontSize: '13px', color: revokeStatus.success ? '#34d399' : '#f87171' }}>
                {revokeStatus.message}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* OCR Certificate Comparison */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h3>OCR Certificate Comparison</h3>
          <p>Extract certificate details and compare them with an issued credential.</p>
        </div>

        <form onSubmit={handleCompareCertificate}>
          <div className="form-group">
            <label>Select Issued Credential</label>
            <select
              value={ocrCredentialId}
              onChange={(e) => setOcrCredentialId(e.target.value)}
              required
            >
              <option value="">Choose a credential</option>
              {issuedCredentials.map((cred) => (
                <option key={cred.id} value={cred.id}>
                  {cred.recipient_name || 'Unknown'} — {cred.sunbird_osid || cred.id}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Upload Certificate (JPEG/PNG)</label>
            <input
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
              required
            />
          </div>

          <div className="form-group">
            <label>Corrected Student Name (optional)</label>
            <input
              type="text"
              value={editedStudentName}
              onChange={(e) => setEditedStudentName(e.target.value)}
              placeholder="Leave blank to use OCR result"
            />
          </div>

          <div className="form-group">
            <label>Corrected Register Number (optional)</label>
            <input
              type="text"
              value={editedRegisterNumber}
              onChange={(e) => setEditedRegisterNumber(e.target.value)}
              placeholder="Leave blank to use OCR result"
            />
          </div>

          <button type="submit" disabled={ocrLoading}>
            {ocrLoading ? 'Processing certificate...' : 'Compare Certificate'}
          </button>
        </form>

        {ocrError && (
          <p style={{ color: 'red', marginTop: '12px' }}>{ocrError}</p>
        )}

        {ocrResult && (
          <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Visual Anti-Fraud & Physical Security Inspection Panel */}
            {ocrResult.visual_verification && (
              <div
                className="glass-card"
                style={{
                  borderColor:
                    ocrResult.visual_verification.visual_verdict === 'VERIFIED_AUTHENTIC_VISUALS'
                      ? 'var(--accent-emerald)'
                      : ocrResult.visual_verification.visual_verdict === 'SUSPICIOUS_REQUIRES_REVIEW'
                      ? 'var(--accent-amber)'
                      : 'var(--accent-rose)',
                  background:
                    ocrResult.visual_verification.visual_verdict === 'VERIFIED_AUTHENTIC_VISUALS'
                      ? 'rgba(5, 150, 105, 0.04)'
                      : 'rgba(220, 38, 38, 0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <ShieldCheck size={20} color={ocrResult.visual_verification.visual_verdict === 'VERIFIED_AUTHENTIC_VISUALS' ? '#059669' : '#dc2626'} />
                    Visual Anti-Fraud & Physical Security Inspection
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Authenticity Score:
                    </span>
                    <span
                      className={`badge ${
                        ocrResult.visual_verification.visual_verdict === 'VERIFIED_AUTHENTIC_VISUALS'
                          ? 'badge-success'
                          : ocrResult.visual_verification.visual_verdict === 'SUSPICIOUS_REQUIRES_REVIEW'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                      style={{ fontSize: '13px', padding: '4px 10px' }}
                    >
                      {((ocrResult.visual_verification.visual_authenticity_score || 0) * 100).toFixed(1)}% — {ocrResult.visual_verification.visual_verdict?.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* 4 Multi-Modal Inspection Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px' }}>
                  {/* 1. Logo Verification */}
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Award size={16} color="var(--accent-blue)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>University Logo / Crest</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Status: <span style={{ color: ocrResult.visual_verification.logo?.detected ? '#059669' : '#dc2626', fontWeight: 600 }}>{ocrResult.visual_verification.logo?.status || 'NOT DETECTED'}</span></div>
                      <div>Confidence: {((ocrResult.visual_verification.logo?.confidence || 0) * 100).toFixed(0)}%</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>{ocrResult.visual_verification.logo?.details}</div>
                    </div>
                  </div>

                  {/* 2. Watermark & Background Security */}
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Layers size={16} color="var(--accent-purple, #a855f7)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Watermark & Paper Grain</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Status: <span style={{ color: ocrResult.visual_verification.watermark?.detected ? '#059669' : '#dc2626', fontWeight: 600 }}>{ocrResult.visual_verification.watermark?.status || 'UNKNOWN'}</span></div>
                      <div>Texture Energy: {ocrResult.visual_verification.watermark?.texture_variance || 'N/A'}</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>{ocrResult.visual_verification.watermark?.details}</div>
                    </div>
                  </div>

                  {/* 3. Official Stamp & Seal */}
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Stamp size={16} color="var(--accent-amber, #f59e0b)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Official Stamp / Seal</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Status: <span style={{ color: ocrResult.visual_verification.stamp_seal?.detected ? '#059669' : '#f59e0b', fontWeight: 600 }}>{ocrResult.visual_verification.stamp_seal?.status || 'NOT FOUND'}</span></div>
                      <div>Security Ink: {ocrResult.visual_verification.stamp_seal?.color_ink_percentage || 0}%</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>{ocrResult.visual_verification.stamp_seal?.details}</div>
                    </div>
                  </div>

                  {/* 4. Digital Tampering (ELA) */}
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <FileCheck size={16} color="var(--accent-emerald, #10b981)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Digital Tampering (ELA)</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>Risk Level: <span style={{ color: ocrResult.visual_verification.tampering_ela?.risk_level === 'LOW' ? '#059669' : '#dc2626', fontWeight: 600 }}>{ocrResult.visual_verification.tampering_ela?.risk_level || 'UNKNOWN'}</span></div>
                      <div>Compression Std: {ocrResult.visual_verification.tampering_ela?.ela_variance || 'N/A'}</div>
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.85 }}>{ocrResult.visual_verification.tampering_ela?.details}</div>
                    </div>
                  </div>
                </div>

                {/* Flagged Visual Security Warnings */}
                {ocrResult.visual_verification.warning_flags?.length > 0 && (
                  <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
                    <strong style={{ fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} /> Visual Security Warnings:
                    </strong>
                    <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '12px', color: '#dc2626' }}>
                      {ocrResult.visual_verification.warning_flags.map((flag, idx) => (
                        <li key={idx}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* OCR Comparison & Field Match Result */}
            <div className="glass-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {ocrResult.comparison?.overall_match ? <CheckCircle size={18} color="#059669" /> : <ShieldAlert size={18} color="#dc2626" />}
                  Credential Field Comparison (OCR)
                </h4>
                <span className={`badge ${ocrResult.comparison?.overall_match ? 'badge-success' : 'badge-danger'}`}>
                  {ocrResult.comparison?.overall_match ? 'ALL FIELDS MATCH' : 'FIELD MISMATCH DETECTED'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', fontSize: '13px' }}>
                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Student Name:</strong>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {ocrResult.edited_values?.student_name || ocrResult.ocr_extracted?.student_name || 'Not detected'}
                  </div>
                  <div style={{ fontSize: '11px', color: ocrResult.comparison?.name_match ? '#059669' : '#dc2626' }}>
                    {ocrResult.comparison?.name_match ? '✔ Matches Issued Record' : '✖ Does not match'}
                  </div>
                </div>

                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Register Number:</strong>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {ocrResult.edited_values?.register_number || ocrResult.ocr_extracted?.register_number || 'Not detected'}
                  </div>
                  <div style={{ fontSize: '11px', color: ocrResult.comparison?.register_match ? '#059669' : '#dc2626' }}>
                    {ocrResult.comparison?.register_match ? '✔ Matches Issued Record' : '✖ Does not match'}
                  </div>
                </div>
              </div>

              {ocrResult.fraud_assessment && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background:
                      ocrResult.fraud_assessment.fraud_risk === 'LOW'
                        ? 'rgba(5, 150, 105, 0.08)'
                        : ocrResult.fraud_assessment.fraud_risk === 'MEDIUM'
                        ? 'rgba(217, 119, 6, 0.08)'
                        : 'rgba(220, 38, 38, 0.08)',
                    border: `1px solid ${
                      ocrResult.fraud_assessment.fraud_risk === 'LOW'
                        ? 'rgba(5, 150, 105, 0.3)'
                        : ocrResult.fraud_assessment.fraud_risk === 'MEDIUM'
                        ? 'rgba(217, 119, 6, 0.3)'
                        : 'rgba(220, 38, 38, 0.3)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldAlert
                        size={18}
                        color={
                          ocrResult.fraud_assessment.fraud_risk === 'LOW'
                            ? '#059669'
                            : ocrResult.fraud_assessment.fraud_risk === 'MEDIUM'
                            ? '#d97706'
                            : '#dc2626'
                        }
                      />
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        Fraud Risk Verdict: {ocrResult.fraud_assessment.verdict?.replace(/_/g, ' ')}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span
                        className={`badge ${
                          ocrResult.fraud_assessment.fraud_risk === 'LOW'
                            ? 'badge-success'
                            : ocrResult.fraud_assessment.fraud_risk === 'MEDIUM'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        Risk: {ocrResult.fraud_assessment.fraud_risk}
                      </span>
                      <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)' }}>
                        Action: {ocrResult.fraud_assessment.recommended_action}
                      </span>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {ocrResult.fraud_assessment.explanation}
                  </p>
                </div>
              )}

              {ocrResult.mismatches?.length > 0 && (
                <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)' }}>
                  <strong style={{ fontSize: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} /> Conflicting Discrepancies:
                  </strong>
                  <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '12px', color: '#dc2626' }}>
                    {ocrResult.mismatches.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ocrResult.uncompared_fields?.length > 0 && (
                <details style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <summary style={{ cursor: 'pointer', opacity: 0.85 }}>
                    Uncompared Fields ({ocrResult.uncompared_fields.length})
                  </summary>
                  <ul style={{ margin: '6px 0 0 18px', padding: 0, opacity: 0.75 }}>
                    {ocrResult.uncompared_fields.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </details>
              )}

              <p style={{ marginTop: '12px', fontSize: '12px', color: '#d97706', marginBottom: 0 }}>
                ℹ {ocrResult.warning}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

