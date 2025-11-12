const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const browserService = require('./browser.service');
const Handlebars = require('../utils/handlebars');

const generateSinglePage = async (pageData, template, tempDir, pageNumber) => {
    const browser = browserService.getBrowser();
    let page;
    try {
        page = await browser.newPage();
        await page.setContent(template(pageData), { waitUntil: 'networkidle0' });

        const pdfPath = path.join(tempDir, `page-${pageNumber}.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
        });
        return pdfPath;
    } finally {
        if (page) await page.close();
    }
};

const generatePdfPages = async (defects, tempDir, onProgress, startingPageNumber = 0) => {
    const templatePath = path.join(__dirname, '..', 'templates', 'defect-template.hbs');
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const limiter = browserService.getLimiter();
    const generationPromises = [];
    let processedCountInBatch = 0;

    for (let i = 0; i < defects.length; i++) {
        const absolutePageNumber = startingPageNumber + i + 1;
        const pageData = { ...defects[i], pageNumber: absolutePageNumber };

        const promise = limiter(async () => {
            const result = await generateSinglePage(pageData, template, tempDir, absolutePageNumber);
            processedCountInBatch++;
            if(onProgress) await onProgress(processedCountInBatch);
            return result;
        });
        generationPromises.push(promise);
    }

    return Promise.all(generationPromises);
};

const mergePdfPages = async (pagePaths, outputPath) => {
    pagePaths.sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)\.pdf$/)[1], 10);
        const numB = parseInt(b.match(/(\d+)\.pdf$/)[1], 10);
        return numA - numB;
    });

    const mergedPdf = await PDFDocument.create();
    for (const pdfPath of pagePaths) {
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
        mergedPdf.addPage(copiedPage);
    }

    const mergedPdfBytes = await mergedPdf.save();
    await fs.writeFile(outputPath, mergedPdfBytes);
};

module.exports = {
    generatePdfPages,
    mergePdfPages,
};
