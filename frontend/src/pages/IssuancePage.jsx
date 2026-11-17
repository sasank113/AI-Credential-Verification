import React, { useState, useEffect } from 'react';
import { credentialsApi, aiApi } from '../services/api';
import { parsePdfCertificate } from '../services/pdfParser';
import { parseCsvAndGenerateCredentials, generateSampleCsvContent } from '../services/csvParser';
import {
  Award, Upload, Cpu, CheckCircle, AlertCircle, FileSpreadsheet,
  PlusCircle, ShieldCheck, FileText, Sparkles, Copy, Download,
  FileUp, FileCheck, Eye, RefreshCw, ArrowRight
} from 'lucide-react';

export default function IssuancePage() {
  const [activeTab, setActiveTab] = useState('pdf_upload'); // 'pdf_upload' | 'single' | 'bulk'
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState('');

  // PDF Direct Upload State
  const [pdfFile, setPdfFile] = useState(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [pdfMeta, setPdfMeta] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Editable fields extracted from PDF
  const [extractedName, setExtractedName] = useState('');
  const [extractedTitle, setExtractedTitle] = useState('');
  const [extractedIssuer, setExtractedIssuer] = useState('');
  const [extractedDate, setExtractedDate] = useState('');
  const [extractedEmail, setExtractedEmail] = useState('');
  const [extractedScore, setExtractedScore] = useState('');
  const [extractedCertId, setExtractedCertId] = useState('');
  const [extractedRegisterNumber, setExtractedRegisterNumber] = useState('');

  // PDF Credential Result State
  const [pdfIssuing, setPdfIssuing] = useState(false);
  const [pdfIssuedResult, setPdfIssuedResult] = useState(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Single Issuance Form
  const [recipientEmail, setRecipientEmail] = useState('eleanor.vance@ai-org.com');
  const [recipientName, setRecipientName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [registerNumber, setRegisterNumber] = useState('');
  const [degree, setDegree] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [studentResult, setStudentResult] = useState('');
  const [minimumClassDivision, setMinimumClassDivision] = useState(
    'Second Class with Distinction'
  );
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [degreeTitle, setDegreeTitle] = useState('AI & Data Science Professional Certificate');
  const [gpa, setGpa] = useState('3.9');
  const [experienceYears, setExperienceYears] = useState('3');

  // Custom Demo Certificate Template modal / state
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  const [newCertName, setNewCertName] = useState('');
  const [newCertIssuer, setNewCertIssuer] = useState('');
  const [newCertDesc, setNewCertDesc] = useState('');

  // AI Eligibility State
  const [evaluatingAi, setEvaluatingAi] = useState(false);
  const [aiEligibilityResult, setAiEligibilityResult] = useState(null);

  // Submit state
  const [issuing, setIssuing] = useState(false);
  const [issuedResult, setIssuedResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Bulk CSV state
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);

  const loadSchemas = async () => {
    try {
      const data = await credentialsApi.getSchemas();
      setSchemas(data);
      if (data.length > 0 && !selectedSchema) setSelectedSchema(data[0].id);
    } catch (err) {
      console.error("Error loading schemas:", err);
    }
  };

  useEffect(() => {
    loadSchemas();
  }, []);

  // Handle PDF File Upload / Drop
  const handlePdfUpload = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      alert("Please upload a valid PDF file (.pdf)");
      return;
    }

    setPdfFile(file);
    setIsParsingPdf(true);
    setPdfIssuedResult(null);

    try {
      const parsed = await parsePdfCertificate(file);
      console.log("EXTRACTED CERTIFICATE FIELDS:");
      console.table(parsed.extracted);
      console.log("EXTRACTED RESULT:", parsed.extracted.result);

      console.log("RAW PDF TEXT:");
      console.log(parsed.fullText);
      setPdfMeta(parsed);

      // Auto fill form fields from PDF AI extraction
      setRecipientName(parsed.extracted.candidateName || '');
      setExtractedName(parsed.extracted.candidateName);
      setExtractedTitle(parsed.extracted.certificateTitle);
      setExtractedIssuer(parsed.extracted.issuerName);
      setExtractedDate(parsed.extracted.issueDate);
      setExtractedEmail(parsed.extracted.recipientEmail);
      setStudentResult(parsed.extracted.result || '');
      setExtractedCertId(parsed.extracted.certificateId);
      setExtractedRegisterNumber(parsed.extracted.registerNumber || '');
      setFatherName(parsed.extracted.fatherName || '');
      setCollegeName(parsed.extracted.collegeName || '');
      setRegisterNumber(parsed.extracted.registerNumber || '');
      setDegree(parsed.extracted.degree || '');
      setBranch(parsed.extracted.branch || '');
      setYear(parsed.extracted.year || '');
    } catch (err) {
      console.error("PDF processing error:", err);
    } finally {
      setIsParsingPdf(false);
    }
  };

  // Generate Credential directly from PDF metadata
  const handleGenerateFromPdf = async (e) => {
    if (e) e.preventDefault();
    if (!pdfMeta) return;


    setPdfIssuing(true);
    setErrorMsg(null);

    try {
      const metaToSubmit = {
        ...pdfMeta,
        candidateName: extractedName || pdfMeta.extracted.candidateName,
        certificateTitle: extractedTitle || pdfMeta.extracted.certificateTitle,
        issuerName: extractedIssuer || pdfMeta.extracted.issuerName,
        issueDate: extractedDate || pdfMeta.extracted.issueDate,
        recipientEmail: extractedEmail || pdfMeta.extracted.recipientEmail,
        gpaOrScore: extractedScore || pdfMeta.extracted.gpaOrScore,
        certificateId: extractedCertId || pdfMeta.extracted.certificateId,
        registerNumber: extractedRegisterNumber || pdfMeta.extracted.registerNumber || '',
        fatherName: fatherName || pdfMeta.extracted.fatherName || '',
        degree: degree || pdfMeta.extracted.degree || '',
        branch: branch || pdfMeta.extracted.branch || '',
        year: year || pdfMeta.extracted.year || '',
        collegeName: collegeName || pdfMeta.extracted.collegeName || '',
      };

      const result = await credentialsApi.issueCredentialFromPdfData(metaToSubmit);
      setPdfIssuedResult(result);
    } catch (err) {
      console.error("PDF issuance error:", err);
      setErrorMsg(
        err.response?.data?.detail ||
        err.message ||
        "Failed to generate credential from PDF."
      );
    } finally {
      setPdfIssuing(false);
    }
  };

  // Quick Demo PDF loader button for testing instantly
  const handleLoadSamplePdf = () => {
    const dummyBlob = new Blob([
      "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj\n4 0 obj<< /Length 120 >>stream\nBT /F1 24 Tf 100 700 Td (This is to certify that Eleanor Vance) Tj ET\nBT /F1 18 Tf 100 650 Td (has completed AI & Data Science Professional Certificate) Tj ET\nBT /F1 14 Tf 100 600 Td (Issued by Stanford University AI Institute) Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000062 00000 n \n0000000127 00000 n \n0000000226 00000 n \ntrailer<< /Size 5 /Root 1 0 R >>\nstartxref\n398\n%%EOF"
    ], { type: 'application/pdf' });

    const dummyFile = new File([dummyBlob], "Stanford_AI_Certificate_EleanorVance.pdf", { type: 'application/pdf' });
    handlePdfUpload(dummyFile);
  };

  const handleCopyJson = () => {
    if (pdfIssuedResult?.credential_payload) {
      navigator.clipboard.writeText(JSON.stringify(pdfIssuedResult.credential_payload, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    if (pdfIssuedResult?.credential_payload) {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pdfIssuedResult.credential_payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${pdfIssuedResult.sunbird_osid}_W3C_Credential.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  const handleAddCustomDemoCertificate = async (e) => {
    e.preventDefault();
    if (!newCertName) return;
    const cert = await credentialsApi.addDemoCertificateSchema({
      schema_name: newCertName,
      issuer_name: newCertIssuer || 'Custom Demo Authority',
      description: newCertDesc || 'Custom Uploaded Demo Certificate Template'
    });
    await loadSchemas();
    setSelectedSchema(cert.id);
    setShowAddCertModal(false);
    setNewCertName('');
    setNewCertIssuer('');
    setNewCertDesc('');
  };


  const handleEvaluateAiEligibility = () => {
    const result = calculateEligibility();
    setEligibilityResult(result);
  };



  const calculateEligibility = () => {
    const normalize = (value) =>
      String(value || "").trim().replace(/\s+/g, " ").toUpperCase();

    const classRanks = {
      "FAIL": 0,
      "PASS": 1,
      "THIRD CLASS": 2,
      "THIRD CLASS WITH DISTINCTION": 3,
      "SECOND CLASS": 4,
      "SECOND CLASS WITH DISTINCTION": 5,
      "FIRST CLASS": 6,
      "FIRST CLASS WITH DISTINCTION": 7,
      "DISTINCTION": 8
    };

    const actualResult = normalize(studentResult);
    const requiredResult = normalize(minimumClassDivision);

    const actualRank = classRanks[actualResult];
    const requiredRank = classRanks[requiredResult];

    if (actualRank === undefined || requiredRank === undefined) {
      return {
        eligible: false,
        confidenceScore: null,
        status: "PENDING_VERIFICATION",
        errors: ["Student result or minimum required result is invalid."]
      };
    }

    const eligible = actualRank >= requiredRank;
    const rankDifference = actualRank - requiredRank;

    const confidenceScore = actualRank >= requiredRank
      ? 100
      : Math.max(0, Math.round((actualRank / Math.max(requiredRank, 1)) * 100));
    return {
      eligible,
      confidenceScore,
      status: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
      actualResult: studentResult,
      requiredResult: minimumClassDivision,
      errors: eligible
        ? []
        : ["Student result does not meet the minimum class division."]
    };
  };
  const handleIssueCredential = async (e) => {
    e.preventDefault();
    setIssuing(true);
    setIssuedResult(null);
    setErrorMsg(null);

    try {
      const currentCert = schemas.find(s => s.id === selectedSchema) || schemas[0];
      const eligibility = calculateEligibility();
      setEligibilityResult(eligibility);

      if (!eligibility.eligible) {
        throw new Error(eligibility.errors.join(" "));
      }

      if (!registerNumber?.trim()) {
        throw new Error("Register number is required.");
      }

      // Check whether this register number already has a credential.
      const existingCredentials = await credentialsApi.getCredentials();

      const duplicate = existingCredentials.find((credential) => {
        const subject =
          credential.credential_payload?.credentialSubject || {};

        const existingRegisterNumber =
          subject.register_number || credential.recipient_identifier;

        return (
          existingRegisterNumber?.trim().toLowerCase() ===
          registerNumber.trim().toLowerCase()
        );
      });

      if (duplicate) {
        throw new Error(
          `This certificate is already issued. Register Number: ${registerNumber}`
        );
      }

      const payload = {
        schema_id: selectedSchema || (schemas[0]?.id || 'default'),
        recipient_identifier: registerNumber,
        recipient_name: recipientName,
        credential_data: {
          student_name: recipientName,
          father_name: fatherName,
          register_number: registerNumber,
          degree: degree,
          branch: branch,
          year: year,
          result: studentResult,
          college_name: collegeName,
          degree_title: currentCert?.schema_name || degreeTitle,
          gpa: parseFloat(gpa),
          experience_years: parseInt(experienceYears)
        }
      };

      const res = await credentialsApi.issueCredential(payload);
      setIssuedResult(res);

    } catch (err) {
      setErrorMsg(
        err.response?.data?.detail ||
        err.message ||
        "Failed to issue credential"
      );
    } finally {
      setIssuing(false);
    }
  };


  const handleBulkSubmit = async (e) => {
    e.preventDefault();

    if (!bulkFile || !selectedSchema) return;

    setIssuing(true);
    setBulkResult(null);
    setErrorMsg(null);

    try {
      const res = await credentialsApi.bulkIssue(
        selectedSchema,
        bulkFile
      );

      setBulkResult(res);
    } catch (err) {
      console.error("Bulk issuance error:", err);

      setErrorMsg(
        err.response?.data?.detail ||
        "Bulk issuance failed. Please check the CSV and backend."
      );
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csvData = generateSampleCsvContent();
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvData);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "Sample_Bulk_Credentials_Upload.csv");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const currentSchemaObj = schemas.find(s => s.id === selectedSchema) || schemas[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Mode Switcher & Add Demo Cert */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'pdf_upload' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('pdf_upload')}
            style={{ fontWeight: 700 }}
          >
            <FileUp size={18} color="var(--accent-cyan)" /> Upload Certificate PDF (Direct Generator)
          </button>

          <button
            className={`btn ${activeTab === 'single' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('single')}
          >
            <Award size={18} /> Manual Form / Template Mode
          </button>

          <button
            className={`btn ${activeTab === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('bulk')}
          >
            <FileSpreadsheet size={18} /> Bulk CSV Batch Engine
          </button>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => setShowAddCertModal(!showAddCertModal)}
          style={{ borderColor: 'var(--accent-cyan)', fontSize: '13px' }}
        >
          <PlusCircle size={16} color="var(--accent-cyan)" /> Add Demo Template
        </button>
      </div>

      {/* Add Custom Demo Certificate Modal / Panel */}
      {showAddCertModal && (
        <div className="glass-card" style={{ border: '1px solid var(--accent-cyan)', background: 'rgba(2, 132, 199, 0.05)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--accent-cyan)" /> Create / Upload Demo Certificate Template
          </h3>
          <form onSubmit={handleAddCustomDemoCertificate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Certificate Title / Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Master of Cyber Security Certificate"
                value={newCertName}
                onChange={(e) => setNewCertName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Issuing Authority / Organization</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. International Credentials Board"
                value={newCertIssuer}
                onChange={(e) => setNewCertIssuer(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Description / Qualification Details</label>
              <input
                type="text"
                className="input-field"
                placeholder="Official verifiable certification description..."
                value={newCertDesc}
                onChange={(e) => setNewCertDesc(e.target.value)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddCertModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary"><PlusCircle size={16} /> Save Demo Template</button>
            </div>
          </form>
        </div>
      )}

      {/* 1. DIRECT PDF CERTIFICATE UPLOAD TAB */}
      {activeTab === 'pdf_upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top Banner / Upload Zone */}
          <div className="glass-card" style={{ padding: '28px', background: 'radial-gradient(ellipse at top right, rgba(37, 99, 235, 0.08), #ffffff)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={22} color="var(--accent-cyan)" /> Direct PDF Certificate Credential Generator
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '680px' }}>
                  Upload your original certificate PDF file directly. Our client-side AI extractor reads candidate name, qualification, issuer details, and cryptographically signs it into a W3C Verifiable Credential in 1 click.
                </p>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleLoadSamplePdf}
                style={{ borderColor: 'var(--accent-blue)', color: 'var(--accent-cyan)', fontSize: '12px' }}
              >
                <FileCheck size={16} /> Load Demo Sample PDF Certificate
              </button>
            </div>

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handlePdfUpload(e.dataTransfer.files[0]);
                }
              }}
              style={{
                border: dragActive ? '2px dashed var(--accent-cyan)' : '2px dashed #cbd5e1',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 20px',
                textAlign: 'center',
                background: dragActive ? 'rgba(2, 132, 199, 0.08)' : '#f8fafc',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onClick={() => document.getElementById('pdfFileInput').click()}
            >
              <input
                id="pdfFileInput"
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files[0] && handlePdfUpload(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(37, 99, 235, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileUp size={30} color="var(--accent-cyan)" />
                </div>
              </div>

              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {pdfFile ? `Uploaded PDF: ${pdfFile.name}` : 'Drop your Certificate PDF file here, or click to browse'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Supports any standard PDF certificate file (Academic degree, Course completion, Professional license, etc.)
              </div>
            </div>
          </div>

          {/* PDF Extracted Data & Credential Issuance Section */}
          {isParsingPdf && (
            <div className="glass-card" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
              <RefreshCw className="spin" size={32} color="var(--accent-cyan)" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Reading & Analyzing PDF Certificate...</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Extracting text lines, candidate metadata, and computing SHA-256 document checksum.</div>
            </div>
          )}

          {pdfMeta && !isParsingPdf && (
            <div className="grid-2">
              {/* Left Column: PDF Source File & Extracted Metadata Form */}
              <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileCheck size={18} color="var(--accent-cyan)" /> AI PDF Metadata Extractor
                  </h4>
                  <span className="badge badge-success">PDF SHA-256 Ready</span>
                </div>

                {/* PDF File Info Snippet */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '12px', border: 'var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span><strong>Filename:</strong> {pdfMeta.fileName}</span>
                    <span><strong>Size:</strong> {pdfMeta.fileSize}</span>
                  </div>
                  <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>Document SHA256:</strong> {pdfMeta.fileHash}
                  </div>
                </div>

                {/* PDF Visual Thumbnail Preview if available */}
                {pdfMeta.pdfThumbnail && (
                  <div style={{ marginBottom: '16px', textAlign: 'center', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>PDF Page Preview</div>
                    <img src={pdfMeta.pdfThumbnail} alt="PDF Preview" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }} />
                  </div>
                )}

                <form onSubmit={handleGenerateFromPdf} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Candidate / Recipient Full Name</label>
                    <input
                      type="text"
                      className="input-field"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Father Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter father's full name"
                      value={fatherName}
                      onChange={(e) => setFatherName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">College Name</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter college name"
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Register Number</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter register number"
                      value={registerNumber}
                      onChange={(e) => setRegisterNumber(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Degree</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Bachelor of Technology"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Branch</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Computer Science and Engineering"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. 2024"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Result / Class</label>
                    <input
                      type="text"
                      className="input-field"
                      value={studentResult}
                      readOnly
                      placeholder="Automatically extracted from certificate"
                    />
                  </div>






                  <div className="form-group">
                    <label className="form-label">Issuing Authority / University</label>
                    <input
                      type="text"
                      className="input-field"
                      value={extractedIssuer}
                      onChange={(e) => setExtractedIssuer(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Issue Date</label>
                      <input
                        type="text"
                        className="input-field"
                        value={extractedDate}
                        onChange={(e) => setExtractedDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

                    <div className="form-group">
                      <label className="form-label">Certificate Serial ID</label>
                      <input
                        type="text"
                        className="input-field"
                        value={extractedCertId}
                        onChange={(e) => setExtractedCertId(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '8px', padding: '14px', fontSize: '15px' }}
                    disabled={pdfIssuing}
                  >
                    <Sparkles size={18} /> {pdfIssuing ? 'Generating W3C Credential...' : '⚡ Generate W3C Credential from PDF'}
                  </button>
                </form>
              </div>

              {/* Right Column: Issued W3C Credential Card Result */}
              <div>
                {errorMsg && (
                  <div
                    className="glass-card"
                    style={{
                      borderColor: 'var(--accent-rose)',
                      marginBottom: '16px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#f87171'
                    }}>
                      <AlertCircle size={20} />
                      <span>{errorMsg}</span>
                    </div>
                  </div>
                )}
                {pdfIssuedResult ? (
                  <div className="glass-card" style={{ borderColor: 'var(--accent-emerald)', padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399' }}>
                        <CheckCircle size={22} />
                        <strong style={{ fontSize: '16px' }}>W3C Verifiable Credential Created!</strong>
                      </div>
                      <span className="badge badge-success">SUNBIRD RC ISSUED</span>
                    </div>

                    {/* Verifiable Certificate Visual Card */}
                    <div
                      style={{
                        border: '2px double rgba(5, 150, 105, 0.4)',
                        borderRadius: 'var(--radius-md)',
                        padding: '24px',
                        background: 'radial-gradient(ellipse at center, rgba(5, 150, 105, 0.08) 0%, #ffffff 100%)',
                        textAlign: 'center',
                        marginBottom: '16px',
                        boxShadow: 'var(--glass-shadow)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                        <div style={{ background: 'var(--gradient-emerald)', padding: '10px', borderRadius: '50%', color: '#fff' }}>
                          <Award size={32} />
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                        {pdfIssuedResult.credential_payload.credentialSubject.issuing_authority}
                      </div>

                      <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0' }}>
                        {pdfIssuedResult.credential_payload.credentialSubject.certificate_title}
                      </h2>

                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0' }}>
                        Official Verifiable Credential for <span style={{ color: 'var(--text-primary)', fontWeight: 700, borderBottom: '1px dashed var(--accent-emerald)' }}>{pdfIssuedResult.credential_payload.credentialSubject.recipient_name}</span> generated directly from source PDF document.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '6px', margin: '14px 0', fontSize: '11px', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                        <div><strong style={{ color: 'var(--text-muted)' }}>Original File:</strong> <span style={{ color: 'var(--text-primary)' }}>{pdfIssuedResult.credential_payload.credentialSubject.source_pdf_filename}</span></div>
                        <div><strong style={{ color: 'var(--text-muted)' }}>Issue Date:</strong> <span style={{ color: 'var(--text-primary)' }}>{pdfIssuedResult.credential_payload.credentialSubject.original_issue_date}</span></div>
                        <div><strong style={{ color: 'var(--text-muted)' }}>Grade/Score:</strong> <span style={{ color: 'var(--text-primary)' }}>{pdfIssuedResult.credential_payload.credentialSubject.score_gpa}</span></div>
                        <div><strong style={{ color: 'var(--text-muted)' }}>Serial ID:</strong> <span style={{ color: 'var(--text-primary)' }}>{pdfIssuedResult.credential_payload.credentialSubject.certificate_serial_id}</span></div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sunbird OSID Registry ID</div>
                          <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                            {pdfIssuedResult.sunbird_osid}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '12px' }}>
                          <ShieldCheck size={18} />
                          <span>Ed25519 Cryptographic Proof</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button className="btn btn-secondary" style={{ flex: 1, fontSize: '12px' }} onClick={handleCopyJson}>
                        <Copy size={14} /> {copiedJson ? 'Copied JSON!' : 'Copy W3C Payload'}
                      </button>
                      <button className="btn btn-secondary" style={{ flex: 1, fontSize: '12px' }} onClick={handleDownloadJson}>
                        <Download size={14} /> Download JSON
                      </button>
                    </div>

                    {/* W3C Payload Preview */}
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Generated W3C Verifiable Credential JSON Payload:</div>
                    <pre className="code-block" style={{ maxHeight: '200px' }}>
                      {JSON.stringify(pdfIssuedResult.credential_payload, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <Award size={54} style={{ opacity: 0.25, marginBottom: '16px', color: 'var(--accent-cyan)' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>Ready to Generate Credential</div>
                    <div style={{ fontSize: '12px', marginTop: '6px', maxWidth: '320px', margin: '6px auto 0 auto' }}>
                      Upload your PDF file on the left and click "Generate W3C Credential from PDF".
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. MANUAL FORM / TEMPLATE TAB */}
      {activeTab === 'single' && (
        <div className="grid-2">
          {/* Issuance Form */}
          <div className="glass-card">
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Award size={20} color="var(--accent-blue)" /> Generate W3C Verifiable Credential
            </h3>

            <form onSubmit={handleIssueCredential}>
              <div className="form-group">
                <label className="form-label">Selected Demo Certificate Template</label>
                <select
                  className="select-field"
                  value={selectedSchema}
                  onChange={(e) => setSelectedSchema(e.target.value)}
                >
                  {schemas.map((s) => (
                    <option key={s.id} value={s.id}>{s.schema_name} ({s.version || 'v1.0'})</option>
                  ))}
                </select>
                {currentSchemaObj && (
                  <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', marginTop: '4px' }}>
                    Issuer: {currentSchemaObj.issuer_name || 'Sunbird RC Issuer'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Candidate / Recipient Full Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter Recipient Name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Father Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter father's full name"
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Register Number</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter register number"
                  value={registerNumber}
                  onChange={(e) => setRegisterNumber(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Degree</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Bachelor of Technology"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Branch</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Computer Science and Engineering"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Year</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 2024"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">College Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter college name"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Result / Class</label>
                  <select
                    className="input-field"
                    value={studentResult}
                    onChange={(e) => setStudentResult(e.target.value)}
                    required
                  >
                    <option value="">Select Result</option>
                    <option value="Distinction">Distinction</option>
                    <option value="First CLASS WITH DISTINCTION">First CLASS WITH DISTINCTION</option>
                    <option value="Second CLASS WITH DISTINCTION">Second CLASS WITH DISTINCTION</option>
                    <option value="Third CLASS WITH DISTINCTION">Third CLASS WITH DISTINCTION</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Minimum Required Class Division(Threshold)
                  </label>

                  <select
                    className="input-field"
                    value={minimumClassDivision}
                    onChange={(e) => setMinimumClassDivision(e.target.value)}
                  >
                    <option value="">Select Minimum Result</option>
                    <option value="Distinction">Distinction</option>
                    <option value="First CLASS WITH DISTINCTION">First CLASS WITH DISTINCTION</option>
                    <option value="Second CLASS WITH DISTINCTION">Second CLASS WITH DISTINCTION</option>
                    <option value="Third CLASS WITH DISTINCTION">Third CLASS WITH DISTINCTION</option>
                    <option value="PASS">PASS</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const result = calculateEligibility();
                    setEligibilityResult(result);
                  }}
                >
                  <Cpu size={16} color="var(--accent-cyan)" />
                  AI Pre-Check Eligibility
                </button>

                <button type="submit" className="btn btn-primary" disabled={issuing}>
                  <Award size={16} /> {issuing ? 'Generating Credential...' : 'Generate & Issue Credential'}
                </button>
              </div>
              {eligibilityResult !== null && (
                <div
                  className="glass-card"
                  style={{
                    marginTop: '20px',
                    padding: '20px',
                    width: '100%'
                  }}
                >
                  <h3>Eligibility Assessment</h3>

                  <h2 style={{
                    color: eligibilityResult.eligible ? '#22c55e' : '#ef4444'
                  }}>
                    {eligibilityResult.eligible ? 'Eligible' : 'Not Eligible'}
                  </h2>

                  <h3>
                    Confidence Score: {eligibilityResult.confidenceScore ?? 'N/A'}%
                  </h3>

                  {eligibilityResult.errors?.map((error, index) => (
                    <p key={index} style={{ color: '#ef4444' }}>
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </form>
          </div>

          {/* Result View: AI Pre-Check & Visual Certificate Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>


            {/* Issued Verifiable Certificate Visual Display */}
            {issuedResult ? (
              <div className="glass-card" style={{ borderColor: 'var(--accent-emerald)', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669' }}>
                    <CheckCircle size={22} />
                    <strong style={{ fontSize: '16px' }}>W3C Verifiable Credential Generated!</strong>
                  </div>
                  <span className="badge badge-success">ACTIVE & VALID</span>
                </div>

                {/* Decorative Visual Certificate Banner */}
                <div
                  style={{
                    border: '2px double rgba(37, 99, 235, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px',
                    background: 'radial-gradient(ellipse at center, rgba(37, 99, 235, 0.08) 0%, #ffffff 100%)',
                    textAlign: 'center',
                    marginBottom: '16px',
                    boxShadow: 'var(--glass-shadow)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                    <div style={{ background: 'var(--gradient-primary)', padding: '10px', borderRadius: '50%', color: '#fff' }}>
                      <Award size={32} />
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                    {currentSchemaObj?.issuer_name || 'Sunbird RC Credential Authority'}
                  </div>

                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0' }}>
                    {currentSchemaObj?.schema_name || degreeTitle}
                  </h2>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0' }}>
                    This certifies that <span style={{ color: 'var(--text-primary)', fontWeight: 700, borderBottom: '1px dashed var(--accent-cyan)' }}>{recipientName}</span> has successfully met all official requirements and qualifications.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sunbird OSID Registry ID</div>
                      <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                        {issuedResult.sunbird_osid}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '12px' }}>
                      <ShieldCheck size={18} />
                      <span>Ed25519 Signed</span>
                    </div>
                  </div>
                </div>

                {/* Raw JSON Payload */}
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>W3C Verifiable Credential Payload:</div>
                <pre className="code-block" style={{ maxHeight: '160px' }}>
                  {JSON.stringify(issuedResult.credential_payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Award size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>No Credential Generated Yet</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Fill in recipient details and click "Generate & Issue Credential" to create a verifiable credential for your demo certificate.</div>
              </div>
            )}

            {errorMsg && (
              <div className="glass-card" style={{ borderColor: 'var(--accent-rose)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                  <AlertCircle size={20} />
                  <span>{errorMsg}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. BULK CSV TAB */}
      {activeTab === 'bulk' && (
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet size={22} color="var(--accent-blue)" /> Bulk Batch CSV Ingestion & Credential Generator
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Upload any CSV file containing recipient names and emails. Each row will be validated and directly issued into a W3C Verifiable Credential.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadSampleCsv}
              style={{ fontSize: '12px', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
            >
              <Download size={14} /> Download Sample CSV Template
            </button>
          </div>

          <form onSubmit={handleBulkSubmit}>
            <div className="form-group" style={{ maxWidth: '400px' }}>
              <label className="form-label">Target Schema / Certificate Template</label>
              <select className="select-field" value={selectedSchema} onChange={(e) => setSelectedSchema(e.target.value)}>
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>{s.schema_name} ({s.version || 'v1.0'})</option>
                ))}
              </select>
            </div>

            <div
              style={{
                border: '2px dashed #cbd5e1',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 20px',
                textAlign: 'center',
                margin: '20px 0',
                background: '#f8fafc'
              }}
            >
              <Upload size={36} color="var(--accent-blue)" style={{ marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {bulkFile ? `Selected CSV: ${bulkFile.name}` : 'Select or Drop Bulk Recipient CSV File'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0' }}>
                Supported CSV Headers: name, email, title, gpa, experience_years, issuer
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files[0] && setBulkFile(e.target.files[0])}
                style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={issuing || !bulkFile} style={{ padding: '12px 24px' }}>
              <Upload size={16} /> {issuing ? 'Processing CSV Records...' : '⚡ Generate W3C Credentials for All Rows'}
            </button>
          </form>

          {bulkResult && (
            <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '16px 20px', background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.3)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h4 style={{ color: '#059669', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={18} /> Bulk Batch Completed Successfully!
                  </h4>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Job ID: <code>{bulkResult.id}</code> | Total Processed: <strong>{bulkResult.processed_records}</strong> | Success: <strong>{bulkResult.successful_records}</strong> | Failed: <strong>{bulkResult.failed_records}</strong>
                  </div>
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px' }}
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bulkResult.credentials || [], null, 2));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `Bulk_W3C_Credentials_${Date.now()}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                  }}
                >
                  <Download size={14} /> Export All W3C Credentials (JSON)
                </button>
              </div>

              {/* Table of Issued Credentials from CSV */}
              <div style={{ background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                  Generated Verifiable Credentials Stream ({(bulkResult.credentials || []).length} Records)
                </div>
                <table className="data-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Recipient Name</th>
                      <th>Email Identifier</th>
                      <th>Certificate Title</th>
                      <th>GPA / Score</th>
                      <th>Sunbird OSID</th>
                      <th>Proof Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bulkResult.credentials || []).map((cred, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cred.recipient_name}</td>
                        <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{cred.recipient_email}</td>
                        <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{cred.certificate_title}</td>
                        <td style={{ fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{cred.score_gpa}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                          {cred.sunbird_osid}
                        </td>
                        <td>
                          <span className="badge badge-success" style={{ fontSize: '11px' }}>
                            <ShieldCheck size={12} /> Ed25519 Signed
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
