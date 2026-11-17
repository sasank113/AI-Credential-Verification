import * as pdfjsLib from 'pdfjs-dist';

// Set up pdfjs worker using cdn fallback compatible with vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.0.379'}/pdf.worker.min.mjs`;

/**
 * Parses an uploaded PDF file and extracts text lines and metadata fields
 * for direct W3C credential generation.
 */
export async function parsePdfCertificate(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // Calculate simple hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const pdfHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    let textLines = [];
    let pdfThumbnail = null;

    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        // Group PDF text elements by their vertical position
        const lineGroups = {};

        textContent.items.forEach(item => {
          const text = item.str?.trim();

          if (!text) return;

          const y = Math.round(item.transform[5]);

          if (!lineGroups[y]) {
            lineGroups[y] = [];
          }

          lineGroups[y].push({
            x: item.transform[4],
            text
          });
        });

        const pageLines = Object.values(lineGroups).map(group =>
          group
            .sort((a, b) => a.x - b.x)
            .map(item => item.text)
            .join(' ')
        );

        textLines.push(...pageLines);

        // Render first page to canvas for preview thumbnail if page 1
        if (i === 1) {
          try {
            const viewport = page.getViewport({ scale: 1.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport }).promise;
            pdfThumbnail = canvas.toDataURL('image/png');
          } catch (e) {
            console.warn("Could not generate page thumbnail:", e);
          }
        }
      }
    } catch (pdfErr) {
      console.warn("PDF.js extraction warning, falling back to heuristic parsing:", pdfErr);
    }

    const fullText = textLines.join(' ');

    // Extraction Heuristics
    const extractedData = extractFieldsFromText(textLines, fullText, file.name);

    return {
      fileName: file.name,
      fileSize: (file.size / 1024).toFixed(1) + ' KB',
      fileHash: pdfHash,
      pdfThumbnail,
      rawTextLines: textLines,
      fullText,
      extracted: extractedData
    };
  } catch (error) {
    console.error("PDF Parsing error:", error);
    throw new Error(
      "Unable to read this PDF. Please upload a valid text-based PDF."
    );
  }
}

function extractFieldsFromText(lines, fullText, fileName) {
  const normalizedLines = lines.map(line => line.trim()).filter(Boolean);

  // Extract a value using its field label.
  // Supports both "Name: ABC" and "Name" followed by "ABC".
  function getFieldValue(labels) {
    const labelPattern = labels.join('|');

    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];

      const match = line.match(
        new RegExp(`^\\s*(?:${labelPattern})\\s*[:\\-]?\\s*(.*)$`, 'i')
      );

      if (match) {
        const value = match[1].trim();

        if (value) return cleanString(value);

        if (normalizedLines[i + 1]) {
          return cleanString(normalizedLines[i + 1]);
        }
      }
    }

    return '';
  }

  const candidateName = getFieldValue([
    'Candidate\\s*/\\s*Recipient\\s*Full\\s*Name',
    'Candidate\\s*Name',
    'Recipient\\s*Name',
    'Student\\s*Name',
    'Name\\s*of\\s*the\\s*Student'
  ]);

  const fatherName = getFieldValue([
    "Father(?:\\s*['’]?s)?\\s*Name",
    "Father"
  ]);

  const collegeName = getFieldValue([
    'College\\s*Name',
    'Name\\s*of\\s*College',
    'Institution\\s*Name'
  ]);

  const registerNumber = getFieldValue([
    'Register\\s*Number',
    'Registration\\s*Number',
    'Roll\\s*Number',
    'Enrollment\\s*Number',
    'Hall\\s*Ticket\\s*Number'
  ]);

  const degree = getFieldValue([
    'Degree(?!\\s*Title)',
    'Degree\\s*Name',
    'Qualification'
  ]);

  const branch = getFieldValue([
    'Branch',
    'Department',
    'Specialization',
    'Stream'
  ]);

  const year = getFieldValue([
    'Year',
    'Passing\\s*Year',
    'Graduation\\s*Year',
    'Year\\s*of\\s*Passing'
  ]);


  const issuerName = getFieldValue([
    'Issuing\\s*Authority\\s*/\\s*University',
    'Issuing\\s*Authority',
    'University\\s*Name',
    'University',
    'Issued\\s*By'
  ]);

  const issueDate = getFieldValue([
    'Issue\\s*Date',
    'Date\\s*of\\s*Issue',
    'Certificate\\s*Date'
  ]);

  const gpaOrScore = getFieldValue([
    'GPA\\s*/\\s*Grade\\s*/\\s*Score',
    'GPA',
    'CGPA',
    'Grade',
    'Score',
    'Class\\s*/\\s*Result',
    'Result'
  ]);


  const normalizedResult = gpaOrScore.toLowerCase();
  let result = '';

  if (normalizedResult.includes('first class')) {
    result = 'First Class with Distinction';
  } else if (normalizedResult.includes('second class')) {
    result = 'Second Class with Distinction';
  } else if (normalizedResult.includes('third class')) {
    result = 'Third Class with Distinction';
  } else if (normalizedResult.includes('distinction')) {
    result = 'Distinction';
  } else if (/\bfail(?:ed)?\b/.test(normalizedResult)) {
    result = 'FAIL';
  } else if (/\bpass(?:ed)?\b/.test(normalizedResult)) {
    result = 'PASS';
  }


  const certificateId = getFieldValue([
    'Certificate\\s*/\\s*Serial\\s*ID',
    'Certificate\\s*ID',
    'Serial\\s*Number',
    'Serial\\s*ID',
    'Certificate\\s*Number',
    'Credential\\s*ID'
  ]);

  return {
    candidateName,
    fatherName,
    collegeName,
    registerNumber,
    degree,
    branch,
    year,
    issuerName,
    issueDate,
    gpaOrScore,
    result,
    certificateId
  };
}


function cleanString(str) {
  if (!str) return '';
  return str.replace(/[:"']/g, '').trim();
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}
