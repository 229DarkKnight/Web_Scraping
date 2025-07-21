const puppeteer = require('puppeteer');
const readline = require('readline');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function getValidTipo() {
    while (true) {
        const input = await prompt("Enter ID type (0 = Cédula Identidad, 2 = Jurídica, 7 = Extranjero): ");
        if (["0", "2", "7"].includes(input)) return input;
        console.log("❌ Tipo de ID inválido. Solo se permite 0, 2 o 7.");
    }
}

async function getValidIDNumber() {
    while (true) {
        const input = await prompt("Enter the ID number (e.g. 304630092): ");
        if (/^\d{9,10}$/.test(input)) return input;
        console.log("❌ Número de ID inválido. Debe tener al menos 9 dígitos numéricos.");
    }
}

async function solveCaptchaWithLangChain(imagePath) {
    const result = spawnSync("python3", ["solve_captcha_langchain.py", imagePath], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    });

    if (result.error) {
        console.error("❌ Error ejecutando el script Python:", result.error);
        return "";
    }

    if (result.stderr) {
        console.error("📄 STDERR desde Python:\n" + result.stderr);
    }

    return result.stdout.trim();
}

(async () => {
    const tipo = await getValidTipo();
    const id = await getValidIDNumber();
    rl.close();

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    let success = false;
    let finalText = "";
    let attempts = 0;

    while (!success && attempts < 3) {
        attempts++;
        console.log(`\n🔁 Attempt ${attempts}...`);
        await page.goto('https://sfa.ccss.sa.cr/moroso/consultarMorosidad.do', { waitUntil: 'networkidle2' });

        await page.waitForSelector('#tipPatrono');
        await page.select('#tipPatrono', tipo);

        await page.waitForSelector('#numPatrono');
        await page.type('#numPatrono', id);

        const captchaSelector = '#imgCaptchaN';
        await page.waitForSelector(captchaSelector);
        const captchaElement = await page.$(captchaSelector);
        const captchaPath = 'captcha.png';
        await captchaElement.screenshot({ path: captchaPath });

        const rawText = await solveCaptchaWithLangChain(captchaPath);

        if (!rawText || rawText.length !== 5) {
            console.log(`❌ Texto de CAPTCHA inválido recibido: "${rawText}"`);
            continue;
        }

        await page.type('input[name="captchaConsulta"]', rawText);

        try {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                page.click('#btnConsultaMorosidad')
            ]);
        } catch (err) {
            console.error("⏱️ Tiempo de espera excedido durante la navegación. Reintentando...");
            continue;
        }

        const pageText = await page.evaluate(() => document.body.innerText);

        if (!pageText.includes("La verificación de caracteres no es correcta") &&
            !pageText.includes("Captcha requerido")) {
            success = true;
            finalText = pageText;
        } else {
            console.log("❌ CAPTCHA incorrecto. Reintentando...");
        }
    }

    if (!success) {
        console.log("❌ Falló la verificación de CAPTCHA después de 3 intentos.");
        await browser.close();
        return;
    }

    console.log("✅ Resultado completo:");
    console.log("---------------------------------------------------");
    console.log(finalText);
    console.log("---------------------------------------------------");

    const timestamp = new Date().toISOString();
    const record = { tipo, id, resultado: finalText, fecha: timestamp };

    // Guardar en resultados.json
    const existingJson = fs.existsSync('resultados.json') ? JSON.parse(fs.readFileSync('resultados.json')) : [];
    existingJson.push(record);
    fs.writeFileSync('resultados.json', JSON.stringify(existingJson, null, 2));

    // Guardar en resultados.csv
    const csvHeader = 'Tipo,ID,Resultado,Fecha\n';
    const csvLine = `${tipo},${id},"${finalText.replace(/"/g, '""')}",${timestamp}\n`;
    if (!fs.existsSync('resultados.csv')) fs.writeFileSync('resultados.csv', csvHeader);
    fs.appendFileSync('resultados.csv', csvLine);

    await browser.close();
})();
