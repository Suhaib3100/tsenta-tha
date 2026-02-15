// Quick script to test PDF parsing
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function main() {
  const pdfPath = path.join(__dirname, '..', 'fixtures', 'sample-resume.pdf');
  console.log('Reading:', pdfPath);
  
  const buffer = fs.readFileSync(pdfPath);
  
  // pdf-parse v2 API - pass data in constructor
  const pdf = new PDFParse({ data: buffer });
  
  // Get info/metadata
  const info = await pdf.getInfo();
  console.log('\n=== PDF INFO ===');
  console.log('Pages:', info.numPages);
  console.log('Metadata:', info.metadata);
  
  // Get text content
  const text = await pdf.getText();
  console.log('\n=== TEXT CONTENT ===');
  console.log(text);
  
  await pdf.destroy();
}

main().catch(console.error);
