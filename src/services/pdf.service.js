import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';

import Handlebars from '../utils/handlebars.util.js';
import * as browserService from './browser.service.js';
import { generateQRCode } from '../utils/qr.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generateSinglePage = async (html, template, tempDir, pageNumber) => {
    const browser = browserService.getBrowser();

    let page;

    try {
        page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const cssPath = path.join(__dirname, '..', 'public', 'css', `${template}.css`);
        if (await fs.pathExists(cssPath)) {
            const cssCache = {};
            if (!cssCache[template]) {
                cssCache[template] = await fs.readFile(cssPath, 'utf-8');
            }
            await page.addStyleTag({ content: cssCache[template] });
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

export const generatePdfPages = async (defects, utils, tempDir, startingPageNumber = 0) => {
    const templatePath = path.join(__dirname, '..', 'templates', `${utils.template}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateSource);

    const limiter = browserService.getLimiter();
    const generationPromises = [];

    for (let i = 0; i < defects.length; i++) {
        const absolutePageNumber = startingPageNumber + i + 1;
        const pageData = { ...defects[i], ...utils, pageNumber: absolutePageNumber };

        const promise = limiter(async () => {
            return await generateSinglePage(template(pageData), utils.template, tempDir, absolutePageNumber);
        });
        generationPromises.push(promise);
    }

    return Promise.all(generationPromises);
};

export const generatePdf = async (data, utils) => {
    const templatePath = path.join(__dirname, '..', 'templates', `${utils.template}.hbs`);
    const templateSource = await fs.readFile(templatePath, 'utf-8');

    const compile = Handlebars.compile(templateSource);

    if (utils.qrCode) {
        utils.qrCode = await generateQRCode(utils.qrCode);
    }

    const html = compile({ ...data, ...utils });

    const pdfPath = await convertToPdf(html, utils.template);

    return path.relative(path.join(__dirname, '../..'), pdfPath).replace(/\\/g, '/');
};

const convertToPdf = async (html, template) => {
    const browser = browserService.getBrowser();

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const reportsDir = path.join(__dirname, '../..', 'reports', `${year.toString()}_YEAR`, `${month}_MONTH`, `${day}_DAY`);
    await fs.mkdir(reportsDir, { recursive: true });

    let page;

    try {
        page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const cssPath = path.join(__dirname, '..', 'public', 'css', `${template}.css`);
        if (await fs.pathExists(cssPath)) {
            const cssCache = {};
            if (!cssCache[template]) {
                cssCache[template] = await fs.readFile(cssPath, 'utf-8');
            }
            await page.addStyleTag({ content: cssCache[template] });
        }

        const pdfPath = path.join(reportsDir, `${Date.now()}.pdf`);

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

export const mergePdfPages = async (pagePaths, outputPath) => {
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

// Save final PDF to reports folder
export const saveReportPdf = async (pdfPath) => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const reportsDir = path.join(__dirname, '../..', 'reports', `${year}_YEAR`, `${month}_MONTH`, `${day}_DAY`);
    await fs.mkdir(reportsDir, { recursive: true });

    const fileName = `${Date.now()}.pdf`;
    const destPath = path.join(reportsDir, fileName);

    await fs.copyFile(pdfPath, destPath);
    console.log(`PDF saved at: ${destPath}`);

    return path.relative(path.join(__dirname, '../..'), destPath).replace(/\\/g, '/');
};
