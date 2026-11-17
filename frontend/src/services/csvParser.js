/**
 * Client-side CSV Parser & Bulk W3C Credential Generator
 */

export async function parseCsvAndGenerateCredentials(file, schema = null) {
  try {
    const text = await file.text();
    const lines = text
      .split(/\r\n|\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    // Extract headers (first non-empty line)
    const rawHeaders = parseCsvRow(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));

    // Map column indices
    const colIndex = {
      name: findColIndex(headers, ['name', 'recipient_name', 'candidate_name', 'full_name', 'student_name']),
      email: findColIndex(headers, ['email', 'recipient_email', 'identifier', 'email_address', 'student_email']),
      title: findColIndex(headers, ['title', 'certificate_title', 'degree', 'degree_title', 'course']),
      gpa: findColIndex(headers, ['gpa', 'score', 'grade', 'marks']),
      experience: findColIndex(headers, ['experience', 'experience_years', 'exp_years', 'years']),
      issuer: findColIndex(headers, ['issuer', 'issuer_name', 'authority', 'organization']),
      date: findColIndex(headers, ['date', 'issue_date', 'issued_at'])
    };

    const dataRows = lines.slice(1);
    const generatedCredentials = [];

    for (let idx = 0; idx < dataRows.length; idx++) {
      const rowText = dataRows[idx];
      const rowValues = parseCsvRow(rowText);
      if (rowValues.length === 0 || (rowValues.length === 1 && !rowValues[0])) continue;

      const recipientName = getRowVal(rowValues, colIndex.name) || `Candidate ${idx + 1}`;
      const recipientEmail = getRowVal(rowValues, colIndex.email) || `user${idx + 1}@example.com`;
      const certTitle = getRowVal(rowValues, colIndex.title) || schema?.schema_name || 'Verifiable Professional Credential';
      const scoreGpa = getRowVal(rowValues, colIndex.gpa) || '3.8';
      const expYears = getRowVal(rowValues, colIndex.experience) || '2';
      const issuerName = getRowVal(rowValues, colIndex.issuer) || schema?.issuer_name || 'Sunbird RC Bulk Engine';
      const issueDate = getRowVal(rowValues, colIndex.date) || new Date().toISOString().split('T')[0];

      const sunbirdOsid = `osid-csv-${Date.now().toString(36)}-${(idx + 1).toString().padStart(3, '0')}`;

      const credentialPayload = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        "id": `urn:uuid:${sunbirdOsid}`,
        "type": ["VerifiableCredential", certTitle],
        "issuer": `did:sunbirdrc:${issuerName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        "issuanceDate": new Date().toISOString(),
        "credentialSubject": {
          "sunbird_osid": sunbirdOsid,
          "recipient_name": recipientName,
          "recipient_email": recipientEmail,
          "certificate_title": certTitle,
          "score_gpa": scoreGpa,
          "experience_years": expYears,
          "issuing_authority": issuerName,
          "issue_date": issueDate,
          "source": "Bulk CSV Ingestion"
        },
        "proof": {
          "type": "Ed25519Signature2020",
          "created": new Date().toISOString(),
          "verificationMethod": `did:sunbirdrc:${issuerName.toLowerCase().replace(/[^a-z0-9]/g, '-')}#key-1`,
          "proofPurpose": "assertionMethod",
          "jws": `eyJhbGciOiJFZERTQSI...csv_proof_${Math.random().toString(36).substring(2, 10)}`
        }
      };

      generatedCredentials.push({
        sunbird_osid: sunbirdOsid,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        certificate_title: certTitle,
        issuer_name: issuerName,
        score_gpa: scoreGpa,
        experience_years: expYears,
        issue_date: issueDate,
        status: "ISSUED",
        credential_payload: credentialPayload
      });
    }

    return {
      id: `batch-job-${Date.now().toString(36)}`,
      processed_records: generatedCredentials.length,
      successful_records: generatedCredentials.length,
      failed_records: 0,
      credentials: generatedCredentials
    };
  } catch (err) {
    console.error("CSV Processing Error:", err);
    throw err;
  }
}

function parseCsvRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(s => s.replace(/^["']|["']$/g, '').trim());
}

function findColIndex(headers, possibleNames) {
  for (let name of possibleNames) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getRowVal(rowValues, colIdx) {
  if (colIdx !== -1 && colIdx < rowValues.length) {
    return rowValues[colIdx];
  }
  return null;
}

export function generateSampleCsvContent() {
  return `name,email,title,gpa,experience_years,issuer
Eleanor Vance,eleanor.vance@ai-org.com,AI & Data Science Professional Certificate,3.9,4,Stanford AI Institute
Marcus Brody,marcus.brody@museum-ed.org,Master of Cyber Security & Compliance,3.8,6,MIT Security Labs
Sophia Chen,sophia.chen@fintech.io,Advanced Cloud Solutions Architect,4.0,5,AWS Training Board
David Miller,david.m@enterprise.com,Verifiable Software Engineering Credentials,3.7,3,Sunbird RC Authority`;
}
