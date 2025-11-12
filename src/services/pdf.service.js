const fs= require('fs-extra');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const browserService = require('./browser.service');
const Handlebars = require('../utils/handlebars');

const generateSinglePage = async (html, template, tempDir, pageNumber) => {
    const browser = browserService.getBrowser();

    let page;

    try {
        page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const cssPath = path.join(__dirname, '..', 'public', 'css', `${template}.css`);
        if (await fs.pathExists(cssPath)) {
            const css = await fs.readFile(cssPath, 'utf-8');
            await page.addStyleTag({ content: css });
        }

        const pdfPath = path.join(tempDir, `page-${pageNumber}.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            margin: {
                top: "20mm",
                bottom: "20mm",
                left: "10mm",
                right: "10mm"
            },
        });

        return pdfPath;
    } finally {
        if (page) {
            await page.close();
        }
    }
};

const generatePdfPages = async (defects, utils, tempDir, onProgress, startingPageNumber = 0) => {
    const templatePath = path.join(__dirname, '..', 'templates', `${utils.template}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const limiter = browserService.getLimiter();
    const generationPromises = [];
    let processedCountInBatch = 0;

    for (let i = 0; i < defects.length; i++) {
        const absolutePageNumber = startingPageNumber + i + 1;
        const pageData = { ...defects[i], ...utils, pageNumber: absolutePageNumber };

        const promise = limiter(async () => {
            const result = await generateSinglePage(template(pageData), utils.template, tempDir, absolutePageNumber);
            processedCountInBatch++;
            if(onProgress) {
                await onProgress(processedCountInBatch);
            }
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
