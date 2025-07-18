const puppeteer = require('puppeteer');
const readline = require('readline');
const fs = require('fs');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

const ID_TYPES = [
    "CÉDULA DE IDENTIDAD EN REGISTRO CIVIL",
    "CÉDULA JURÍDICA",
    "EXTRANJERO CON IDENTIFICACIÓN CCSS"
];

(async () => {
    const idTypeInput = await ask(`Seleccione el tipo de identificación:\n0 - ${ID_TYPES[0]}\n1 - ${ID_TYPES[1]}\n2 - ${ID_TYPES[2]}\nDigite 0, 1 o 2 según el tipo de identificación: `);
    const idTypeIndex = parseInt(idTypeInput);
    const idNumber = await ask("Digite el número de identificación: ");
    rl.close();

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://sfa.ccss.sa.cr/moroso/consultarMorosidad.do");

    const maxAttempts = 3;
    let success = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`\n🔁 Intento ${attempt}...`);

        const idSelect = await page.waitForSelector('select[name="tipoIdentificacion"]');
        await idSelect.select(`${idTypeIndex}`);

        await page.type('input[name="numeroIdentificacion"]', idNumber);

        // Captura del CAPTCHA
        const captchaImage = await page.waitForSelector('#captchaImg');
        const captchaPath = 'captcha.png';
        await captchaImage.screenshot({ path: captchaPath });

        console.log("🧠 Procesando CAPTCHA...");
        const captchaText = execSync(`python3 ocr_solver.py ${captchaPath}`).toString().trim();
        console.log(`CAPTCHA leído como: ${captchaText}`);

        await page.type('input[name="captchaConsulta"]', captchaText);
        await Promise.all([
            page.click('input[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { })
        ]);

        const content = await page.content();
        if (!content.includes("Captcha requerido") && !content.includes("La verificación de caracteres no es correcta")) {
            console.log("\n✅ Resultado obtenido:\n");
            const text = await page.evaluate(() => document.body.innerText);
            console.log(text);
            success = true;
            break;
        } else {
            console.log("❌ CAPTCHA incorrecto o faltante. Reintentando...");
            await page.goto("https://sfa.ccss.sa.cr/moroso/consultarMorosidad.do");
        }
    }

    if (!success) {
        console.log("❌ Falló el envío del formulario tras 3 intentos.");
    }

    await browser.close();
})();
